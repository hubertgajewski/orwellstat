import { test } from '@fixtures/base.fixture';
import { StatsPage } from '@pages/authenticated/stats.page';

test.fixme('stats page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to StatsPage.url and verify page content.
  await page.goto(StatsPage.url);
});
