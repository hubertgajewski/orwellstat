import { writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import type { TestInfo } from '@playwright/test';

const DOM_TRUNCATE_CHARS = 30_000;

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
    const diagnosis = firstBlock?.type === 'text' ? firstBlock.text : '';
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
