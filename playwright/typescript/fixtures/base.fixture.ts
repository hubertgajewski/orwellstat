import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { loadEnv, requireCredentials } from '@utils/env.util';

loadEnv(import.meta.url, 3);

const DOM_TRUNCATE_CHARS = 30_000;

type OrwellStatFixtures = {
  authenticatedRequest: APIRequestContext;
  unauthenticatedRequest: APIRequestContext;
};

export const test = base.extend<OrwellStatFixtures>({
  page: async ({ page }, use, testInfo) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      if (logs.length > 0) {
        const logPath = testInfo.outputPath('console.log');
        writeFileSync(logPath, logs.join('\n'));
        await testInfo.attach('console logs', {
          path: logPath,
          contentType: 'text/plain',
        });
      }

      const styleLinks = await page.evaluate<string[]>(() =>
        Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
          .map((l) => l.getAttribute('href'))
          .filter((href): href is string => href !== null)
      );
      const xmlProlog = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        ...styleLinks.map((href) => `<?xml-stylesheet type="text/css" href="${href}"?>`),
      ].join('\n');
      const domContent = xmlProlog + '\n' + (await page.content());
      const domPath = testInfo.outputPath('dom.xhtml');
      writeFileSync(domPath, domContent);
      await testInfo.attach('DOM', {
        path: domPath,
        contentType: 'text/html',
      });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      const diagnosisEnabled = process.env.CLAUDE_DIAGNOSIS === 'true';
      if (apiKey && diagnosisEnabled) {
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
    }
  },

  unauthenticatedRequest: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL });
    await use(ctx);
    await ctx.dispose();
  },

  authenticatedRequest: async ({ request }, use) => {
    const { user, password } = requireCredentials();
    const response = await request.post('/zone/', {
      form: {
        username: user,
        password: password,
      },
    });
    expect(response.ok()).toBeTruthy();
    await use(request);
  },
});

export {
  expect,
  request,
  type Page,
  type Locator,
  type BrowserContext,
  type APIRequestContext,
} from '@playwright/test';

export { default as pixelmatch } from 'pixelmatch';
export { PNG } from 'pngjs';
