import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { writeFileSync } from 'fs';
import { loadEnv, requireCredentials } from '@utils/env.util';

loadEnv(import.meta.url, 3);

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

      const domPath = testInfo.outputPath('dom.html');
      writeFileSync(domPath, await page.content());
      await testInfo.attach('DOM', {
        path: domPath,
        contentType: 'text/html',
      });
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
} from '@playwright/test';

export { default as pixelmatch } from 'pixelmatch';
export { PNG } from 'pngjs';
