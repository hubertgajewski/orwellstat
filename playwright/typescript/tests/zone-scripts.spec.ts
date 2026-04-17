import { test } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';

test.fixme('scripts page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to ScriptsPage.url and verify page content.
  await page.goto(ScriptsPage.url);
});
