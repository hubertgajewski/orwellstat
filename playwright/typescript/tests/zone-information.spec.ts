import { test } from '@fixtures/base.fixture';
import { InformationPage } from '@pages/authenticated/information.page';

test.fixme('information page - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to InformationPage.url and verify page content.
  await page.goto(InformationPage.url);
});
