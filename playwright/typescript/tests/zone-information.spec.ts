import { test, expect } from '@fixtures/base.fixture';
import { InformationPage } from '@pages/authenticated/information.page';

// /zone/ renders one of two states depending on whether the signed-in account has hits
// in the last 30 days: an empty-state message, or visit-frequency + ranking sections with
// data tables. The test accepts either state.
test('information page - content', { tag: '@regression' }, async ({ page }) => {
  await page.goto(InformationPage.url);
  const informationPage = new InformationPage(page);

  await expect(informationPage.heading).toBeVisible();

  await expect(
    informationPage.emptyStateHeading.or(informationPage.visitFrequencyHeading)
  ).toBeVisible();

  if (await informationPage.visitFrequencyHeading.isVisible()) {
    await expect(informationPage.rankingHeading).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(2);
    await expect(informationPage.visitFrequencyTable).not.toBeEmpty();
    await expect(informationPage.rankingTable).not.toBeEmpty();
  }
});
