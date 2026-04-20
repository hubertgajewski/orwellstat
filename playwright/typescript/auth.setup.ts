import { test as setup, expect, type Page } from '@playwright/test';
import { loadEnv, requireCredentials, type Account } from '@utils/env.util';
import { AbstractPage } from '@pages/abstract.page';

loadEnv(import.meta.url, 2);

// Run the two logins sequentially to avoid any login-throttling edge cases on the target
// server. The setup project is also marked non-parallel in `playwright.config.ts`.
setup.describe.configure({ mode: 'serial' });

async function authenticate(page: Page, account: Account): Promise<void> {
  const { user, password } = requireCredentials(account);
  await page.goto('/');
  await page.locator('[name="username"]').fill(user);
  await page.locator('[name="password"]').fill(password);
  await page.locator('form[action="/zone/"]').getByRole('button').click();
  await page.waitForURL('**/zone/');
  await expect(page.getByText(AbstractPage.loggedInAs)).toBeVisible();
  await page
    .context()
    .storageState({ path: new URL(`.auth/${account}.json`, import.meta.url).pathname });
}

setup('authenticate populated', async ({ page }) => {
  await authenticate(page, 'populated');
});

setup('authenticate empty', async ({ page }) => {
  await authenticate(page, 'empty');
});
