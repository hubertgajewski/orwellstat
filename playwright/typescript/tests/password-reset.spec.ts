import { test } from '@fixtures/base.fixture';
import { PasswordResetPage } from '@pages/public/password-reset.page';

test.fixme('password reset page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to PasswordResetPage.url and verify page content (headings, form fields, labels).
  await page.goto(PasswordResetPage.url);
});
