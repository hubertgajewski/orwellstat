import { test } from '@fixtures/base.fixture';
import { AdminPage } from '@pages/authenticated/admin.page';

test.fixme('admin page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to AdminPage.url and verify page content.
  await page.goto(AdminPage.url);
});
