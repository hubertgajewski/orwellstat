import { writeFileSync } from 'fs';
import type { TestInfo } from '@playwright/test';

const DOM_TRUNCATE_CHARS = 30_000;

const SELECTOR_ERROR_PATTERN =
  /strict mode violation|waiting for locator|waiting for getBy|locator\.\w+:.*timeout/i;

const SELECTOR_EXTRACT_PATTERN =
  /((?:locator|getByRole|getByText|getByLabel|getByTestId|getByPlaceholder|getByAltText|getByTitle)\([^)\n]*(?:\)[^)\n]*)*\))/;

// Each replacement preserves the header/tag name ($1) so the AI can still reason about
// structure (e.g. "a Cookie header was present") without seeing the secret itself.
// Terminator exclusions are deliberately broad: DOM snapshots embed tokens inside quoted
// strings, XHTML tags, and script bodies, so stopping at `"`, `<`, `>`, `'`, `` ` ``
// prevents the greedy value match from swallowing surrounding markup.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  // Cookie: <name>=<value> (case-insensitive). Value runs until a separator or quote/angle.
  [/(Cookie:\s*[^;=\s]+=)[^;\n\r"<>]+/gi, '$1[REDACTED]'],
  // Set-Cookie: <name>=<value>. Same shape as the request-side Cookie header.
  [/(Set-Cookie:\s*[^;=\s]+=)[^;\n\r"<>]+/gi, '$1[REDACTED]'],
  // Multi-pair cookie chain: any subsequent `; <name>=<value>` segment that
  // wasn't anchored on the leading `Cookie:` / `Set-Cookie:` prefix. Catches
  // `Cookie: a=1; b=2; c=3` (b=2, c=3) after the first pair has been masked
  // by the rule above. Necessarily over-redacts Set-Cookie attributes
  // (`Path=/`, `Domain=…`, `Max-Age=…`) — acceptable since none of those
  // values are useful to the LLM for diagnosis.
  [/(;\s*[^;=\s]+=)[^;\n\r"<>]+/g, '$1[REDACTED]'],
  // Authorization: Bearer <token>
  [/(Authorization:\s*Bearer\s+)[^\s<>"'`]+/gi, '$1[REDACTED]'],
  // Standalone `bearer <token>` when it appears without the Authorization prefix.
  // Requires 12+ chars so "[REDACTED]" from the prior pattern is not re-matched.
  [/(bearer\s+)[A-Za-z0-9._\-]{12,}/gi, '$1[REDACTED]'],
  // x-api-key / apikey header (header- and JSON-shaped). The optional `["']?`
  // around the separator absorbs the JSON closing quote on the key (`"apikey":`)
  // and the opening quote on the value (`: "value"`), so both header and JSON
  // shapes are matched. The closing value-quote is intentionally left outside
  // the match to keep surrounding quoting intact in the output. The 8-char
  // minimum on the value avoids masking placeholder words ("apikey: TODO").
  [/((?:x-api-key|apikey)["']?\s*[:=]\s*["']?)[A-Za-z0-9._\-]{8,}/gi, '$1[REDACTED]'],
  // apikey / api_key / token in a URL query string.
  [/([?&](?:apikey|api_key|token)=)[^&\s"'<>]+/gi, '$1[REDACTED]'],
  // Raw JWT anywhere — header.payload.signature, all base64url, with the
  // canonical `eyJ` prefix on header and payload (which decode to `{"…`).
  // Replaces with [REDACTED_JWT] so the structural marker survives even
  // when the token wasn't behind a Bearer/Authorization prefix.
  [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]'],
  // Email: keep first local-part char + domain, mask the rest of the local part.
  // `a@b.co` → `a***@b.co`, `alice@example.com` → `a***@example.com`.
  [/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***$2'],
];

export function redactSensitive(input: string): string {
  return REDACT_PATTERNS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), input);
}

interface SelectorFixResponse {
  confidence: 'high' | 'medium' | 'low';
  brokenSelector: string;
  suggestedSelector: string;
  explanation: string;
}

type AiCompletionFn = (opts: {
  model: string;
  maxTokens: number;
  system: string;
  userContent: string;
}) => Promise<string>;

const MODEL_MAP = {
  anthropic: { fast: 'claude-haiku-4-5', strong: 'claude-sonnet-4-6' },
  // Both tiers use the same model: free-tier Pro access is unavailable,
  // and gemini-3.1-flash-lite-preview has the best RPD quota (500 vs 20).
  gemini: { fast: 'gemini-3.1-flash-lite-preview', strong: 'gemini-3.1-flash-lite-preview' },
} as const;

type AiProvider = keyof typeof MODEL_MAP;

interface Models {
  fast: string;
  strong: string;
}

function isAiProvider(value: string): value is AiProvider {
  return value in MODEL_MAP;
}

const API_KEY_ENV: Record<AiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

type CompletionFactory = (apiKey: string) => Promise<AiCompletionFn>;

const PROVIDER_FACTORY: Record<AiProvider, CompletionFactory> = {
  async anthropic(apiKey) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    return async ({ model, maxTokens, system, userContent }) => {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      });
      const firstBlock = response.content[0];
      return firstBlock?.type === 'text' ? firstBlock.text : '';
    };
  },
  async gemini(apiKey) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    return async ({ model, maxTokens, system, userContent }) => {
      const generativeModel = genAI.getGenerativeModel({
        model,
        systemInstruction: system,
        generationConfig: { maxOutputTokens: maxTokens },
      });
      const result = await generativeModel.generateContent(userContent);
      return result.response.text();
    };
  },
};

function extractBrokenSelector(errorMessages: string): string | null {
  if (!SELECTOR_ERROR_PATTERN.test(errorMessages)) return null;
  const match = errorMessages.match(SELECTOR_EXTRACT_PATTERN);
  if (!match) {
    console.warn('[Selector fix] selector error detected but no locator pattern extracted');
  }
  return match?.[1] ?? null;
}

async function requestDiagnosis(
  complete: AiCompletionFn,
  models: Models,
  testInfo: TestInfo,
  logs: string[],
  errorMessages: string,
  domSnippet: string
): Promise<string> {
  return complete({
    model: models.fast,
    maxTokens: 1024,
    system:
      'You are a test-failure analyst for a Playwright E2E suite. Given failed test metadata, browser console logs, and a DOM snapshot, produce a concise diagnosis: (1) most likely root cause, (2) what assertion probably failed and why, (3) one suggested fix.',
    userContent: [
      `Test: ${testInfo.title}`,
      `Project: ${testInfo.project.name}`,
      `Status: ${testInfo.status} (expected: ${testInfo.expectedStatus})`,
      `Errors:\n${errorMessages || '(none)'}`,
      '',
      '--- Console logs ---',
      logs.length > 0 ? logs.join('\n') : '(none)',
      '',
      '--- DOM snapshot (may be truncated) ---',
      domSnippet,
    ].join('\n'),
  });
}

async function requestSelectorFix(
  complete: AiCompletionFn,
  models: Models,
  brokenSelector: string,
  errorMessages: string,
  domSnippet: string
): Promise<SelectorFixResponse | null> {
  const text = await complete({
    model: models.strong,
    maxTokens: 1024,
    system: `You are a Playwright test selector specialist. A test failed because a locator could not find an element or matched multiple elements.

Given the broken selector, the error message, and a DOM snapshot, propose a replacement selector.

This project uses getByRole/getByText with exact: true as the preferred selector strategy. Avoid CSS selectors unless absolutely necessary.

Reply with ONLY a JSON object (no markdown fencing, no extra text) matching this schema:
{
  "confidence": "high" | "medium" | "low",
  "brokenSelector": "<the original broken selector>",
  "suggestedSelector": "<your proposed replacement>",
  "explanation": "<why the original failed and why this fix should work>"
}

Confidence guidelines:
- "high": The DOM clearly contains the target element and the fix is unambiguous.
- "medium": The DOM likely contains the target element but the fix involves assumptions.
- "low": The target element may not exist in the DOM or the fix is speculative.`,
    userContent: [
      `Broken selector: ${brokenSelector}`,
      `Errors:\n${errorMessages}`,
      '',
      '--- DOM snapshot (may be truncated) ---',
      domSnippet,
    ].join('\n'),
  });

  if (!text) return null;

  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as SelectorFixResponse;
    if (
      !['high', 'medium', 'low'].includes(parsed.confidence) ||
      typeof parsed.brokenSelector !== 'string' ||
      typeof parsed.suggestedSelector !== 'string' ||
      typeof parsed.explanation !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function attachSelectorFix(
  complete: AiCompletionFn,
  models: Models,
  testInfo: TestInfo,
  errorMessages: string,
  domSnippet: string
): Promise<string | null> {
  const brokenSelector = extractBrokenSelector(errorMessages);
  if (!brokenSelector) return null;

  const fix = await requestSelectorFix(complete, models, brokenSelector, errorMessages, domSnippet);
  if (!fix) return null;

  if (fix.confidence === 'low') {
    return `\n\n---\n\n> **Selector fix (low confidence, not attached):** \`${fix.suggestedSelector}\` — ${fix.explanation}`;
  }

  const fixContent = [
    '# Selector Fix Proposal',
    '',
    `**Confidence:** ${fix.confidence}`,
    `**Broken selector:** \`${fix.brokenSelector}\``,
    `**Suggested selector:** \`${fix.suggestedSelector}\``,
    '',
    '## Explanation',
    fix.explanation,
  ].join('\n');

  const fixPath = testInfo.outputPath('selector-fix.md');
  writeFileSync(fixPath, fixContent);
  await testInfo.attach('Selector fix', {
    path: fixPath,
    contentType: 'text/plain',
  });

  return null;
}

export async function attachAiDiagnosis(
  testInfo: TestInfo,
  logs: string[],
  domContent: string
): Promise<void> {
  if (process.env.AI_DIAGNOSIS !== 'true') return;

  const provider = process.env.AI_PROVIDER ?? 'anthropic';
  if (!isAiProvider(provider)) {
    console.warn(`[AI diagnosis] unknown AI_PROVIDER "${provider}", skipping`);
    return;
  }

  const apiKey = process.env[API_KEY_ENV[provider]];
  if (!apiKey) return;

  try {
    const complete = await PROVIDER_FACTORY[provider](apiKey);
    const models = {
      fast: process.env.AI_MODEL_FAST || MODEL_MAP[provider].fast,
      strong: process.env.AI_MODEL_STRONG || MODEL_MAP[provider].strong,
    };
    console.log(`[AI diagnosis] provider=${provider} fast=${models.fast} strong=${models.strong}`);

    // Redact before truncation so cut-off tokens cannot leak their prefix.
    const redactedDom = redactSensitive(domContent);
    const domSnippet =
      redactedDom.length > DOM_TRUNCATE_CHARS
        ? redactedDom.slice(0, DOM_TRUNCATE_CHARS) + '\n...[truncated]'
        : redactedDom;
    const redactedLogs = logs.map(redactSensitive);
    const errorMessages = redactSensitive(
      testInfo.errors
        .map((e) => e.message ?? '')
        .filter(Boolean)
        .join('\n')
        .replace(/\x1b\[[0-9;]*m/g, '')
    );

    const [diagnosisText, selectorNote] = await Promise.all([
      requestDiagnosis(complete, models, testInfo, redactedLogs, errorMessages, domSnippet),
      attachSelectorFix(complete, models, testInfo, errorMessages, domSnippet).catch((err) => {
        console.warn('[Selector fix] skipped:', err);
        return null;
      }),
    ]);

    const diagnosis = selectorNote ? diagnosisText + selectorNote : diagnosisText;

    if (diagnosis) {
      const diagPath = testInfo.outputPath('diagnosis.md');
      writeFileSync(diagPath, diagnosis);
      await testInfo.attach('AI diagnosis', {
        path: diagPath,
        contentType: 'text/plain',
      });
    }
  } catch (err) {
    // Diagnosis is best-effort; never fail a test because of it
    console.warn('[AI diagnosis] skipped:', err);
  }
}
