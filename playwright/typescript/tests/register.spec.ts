import { test } from '@fixtures/base.fixture';
import { RegisterPage } from '@pages/public/register.page';

test.fixme('register page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to RegisterPage.url and verify page content (headings, form fields, labels).
  await page.goto(RegisterPage.url);
});
