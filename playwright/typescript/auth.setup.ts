import { test as setup } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.locator('[name="username"]').fill(process.env.ORWELLSTAT_USER!);
  await page
    .locator('[name="password"]')
    .fill(process.env.ORWELLSTAT_PASSWORD!);
  await page.locator('form[action="/zone/"]').getByRole('button').click();
  await page.waitForURL('**/zone/');
  await page.context().storageState({ path: new URL('.auth/user.json', import.meta.url).pathname });
});
