import { test as base, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'fs';
import { loadEnv } from '@utils/env.util';
import { attachAiDiagnosis } from '@utils/diagnosis.util';

loadEnv(import.meta.url, 3);

async function attachConsoleLogs(testInfo: TestInfo, logs: string[]): Promise<void> {
  if (logs.length === 0) return;
  const logPath = testInfo.outputPath('console.log');
  writeFileSync(logPath, logs.join('\n'));
  await testInfo.attach('console logs', { path: logPath, contentType: 'text/plain' });
}

async function attachDomSnapshot(page: Page, testInfo: TestInfo): Promise<string> {
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
  await testInfo.attach('DOM', { path: domPath, contentType: 'text/html' });
  return domContent;
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      await attachConsoleLogs(testInfo, logs);
      const domContent = await attachDomSnapshot(page, testInfo);
      await attachAiDiagnosis(testInfo, logs, domContent);
    }
  },
});

export {
  expect,
  request,
  type Page,
  type Locator,
  type BrowserContext,
  type APIRequestContext,
  type TestInfo,
} from '@playwright/test';

export { default as pixelmatch } from 'pixelmatch';
export { PNG } from 'pngjs';
