import { test, expect } from '@fixtures/base.fixture';
import { RegisterPage } from '@pages/public/register.page';

test('register page - content', { tag: '@regression' }, async ({ page }) => {
  const register = new RegisterPage(page);
  await register.goto();

  await expect(register.heading).toBeVisible();
  await expect(register.usernameField).toBeEditable();
  await expect(register.passwordField).toBeEditable();
  await expect(register.confirmPasswordField).toBeEditable();
  await expect(register.emailField).toBeEditable();
  await expect(register.submitButton).toBeEnabled();
  await expect(register.loginNavLink).toBeVisible();
});
