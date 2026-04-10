import { writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import type { TestInfo } from '@playwright/test';

const DOM_TRUNCATE_CHARS = 30_000;

const SELECTOR_ERROR_PATTERN =
  /strict mode violation|waiting for locator|waiting for getBy|locator\.\w+:.*timeout/i;

const SELECTOR_EXTRACT_PATTERN =
  /((?:locator|getByRole|getByText|getByLabel|getByTestId|getByPlaceholder|getByAltText|getByTitle)\([^)]*(?:\)[^)]*)*\))/;

interface SelectorFixResponse {
  confidence: 'high' | 'medium' | 'low';
  brokenSelector: string;
  suggestedSelector: string;
  explanation: string;
}

function extractBrokenSelector(errorMessages: string): string | null {
  if (!SELECTOR_ERROR_PATTERN.test(errorMessages)) return null;
  const match = errorMessages.match(SELECTOR_EXTRACT_PATTERN);
  if (!match) {
    console.warn('[Selector fix] selector error detected but no locator pattern extracted');
  }
  return match?.[1] ?? null;
}

async function requestHaikuDiagnosis(
  anthropic: Anthropic,
  testInfo: TestInfo,
  logs: string[],
  errorMessages: string,
  domSnippet: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system:
      'You are a test-failure analyst for a Playwright E2E suite. Given failed test metadata, browser console logs, and a DOM snapshot, produce a concise diagnosis: (1) most likely root cause, (2) what assertion probably failed and why, (3) one suggested fix.',
    messages: [
      {
        role: 'user',
        content: [
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
      },
    ],
  });
  const firstBlock = response.content[0];
  return firstBlock?.type === 'text' ? firstBlock.text : '';
}

async function requestSelectorFix(
  anthropic: Anthropic,
  brokenSelector: string,
  errorMessages: string,
  domSnippet: string
): Promise<SelectorFixResponse | null> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
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
    messages: [
      {
        role: 'user',
        content: [
          `Broken selector: ${brokenSelector}`,
          `Errors:\n${errorMessages}`,
          '',
          '--- DOM snapshot (may be truncated) ---',
          domSnippet,
        ].join('\n'),
      },
    ],
  });

  const firstBlock = response.content[0];
  const text = firstBlock?.type === 'text' ? firstBlock.text : '';
  if (!text) return null;

  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as SelectorFixResponse;
    if (
      typeof parsed.confidence !== 'string' ||
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
  anthropic: Anthropic,
  testInfo: TestInfo,
  errorMessages: string,
  domSnippet: string
): Promise<string | null> {
  const brokenSelector = extractBrokenSelector(errorMessages);
  if (!brokenSelector) return null;

  const fix = await requestSelectorFix(anthropic, brokenSelector, errorMessages, domSnippet);
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const diagnosisEnabled = process.env.CLAUDE_DIAGNOSIS === 'true';
  if (!apiKey || !diagnosisEnabled) return;

  try {
    const anthropic = new Anthropic({ apiKey });
    const domSnippet =
      domContent.length > DOM_TRUNCATE_CHARS
        ? domContent.slice(0, DOM_TRUNCATE_CHARS) + '\n...[truncated]'
        : domContent;
    const errorMessages = testInfo.errors
      .map((e) => e.message ?? '')
      .filter(Boolean)
      .join('\n');

    const [diagnosisText, selectorNote] = await Promise.all([
      requestHaikuDiagnosis(anthropic, testInfo, logs, errorMessages, domSnippet),
      attachSelectorFix(anthropic, testInfo, errorMessages, domSnippet).catch((err) => {
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
