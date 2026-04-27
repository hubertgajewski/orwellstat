import { test, expect } from '@fixtures/base.fixture';
import { PasswordResetPage } from '@pages/public/password-reset.page';

test('password reset page - content', { tag: '@regression' }, async ({ page }) => {
  const passwordReset = new PasswordResetPage(page);
  await passwordReset.goto();

  await expect(passwordReset.heading).toBeVisible();
  await expect(passwordReset.usernameField).toBeEditable();
  await expect(passwordReset.submitButton).toBeEnabled();
  await expect(passwordReset.backToHomeLink).toHaveAttribute('href', '/');
});
