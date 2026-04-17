import { test } from '@fixtures/base.fixture';
import { HitsPage } from '@pages/authenticated/hits.page';

test.fixme('hits page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to HitsPage.url and verify page content.
  await page.goto(HitsPage.url);
});
