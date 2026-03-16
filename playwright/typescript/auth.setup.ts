import { test as setup, expect } from '@playwright/test';
import { loadEnv, requireCredentials } from '@utils/env.util';
import { AbstractPage } from '@pages/abstract.page';

loadEnv(import.meta.url, 2);
const { user, password } = requireCredentials();

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.locator('[name="username"]').fill(user);
  await page.locator('[name="password"]').fill(password);
  await page.locator('form[action="/zone/"]').getByRole('button').click();
  await page.waitForURL('**/zone/');
  await expect(page.getByText(AbstractPage.loggedInAs)).toBeVisible();
  await page.context().storageState({ path: new URL('.auth/user.json', import.meta.url).pathname });
});
