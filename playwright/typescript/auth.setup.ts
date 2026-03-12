import { test as setup } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const { ORWELLSTAT_USER, ORWELLSTAT_PASSWORD } = process.env;
if (!ORWELLSTAT_USER || !ORWELLSTAT_PASSWORD) {
  throw new Error(
    'Missing ORWELLSTAT_USER or ORWELLSTAT_PASSWORD. ' +
      'Set them in .env (local) or as repository secrets (CI).'
  );
}

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.locator('[name="username"]').fill(ORWELLSTAT_USER);
  await page
    .locator('[name="password"]')
    .fill(ORWELLSTAT_PASSWORD);
  await page.locator('form[action="/zone/"]').getByRole('button').click();
  await page.waitForURL('**/zone/');
  await page.context().storageState({ path: new URL('.auth/user.json', import.meta.url).pathname });
});
