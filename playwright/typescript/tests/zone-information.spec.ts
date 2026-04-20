import { test, expect } from '@fixtures/base.fixture';
import { EMPTY_STORAGE_STATE } from '@fixtures/storage-state';
import { InformationPage } from '@pages/authenticated/information.page';

// /zone/ renders one of two mutually-exclusive states depending on whether the signed-in
// account has hits in the last 30 days. Each account has a dedicated describe so both
// branches run deterministically — no runtime branching. Default storage state is the
// populated account (real hit data); the empty-account describe opts in via test.use.

test.describe('information page (populated account)', { tag: '@regression' }, () => {
  test('visit-frequency and ranking sections with data', async ({ page }) => {
    await page.goto(InformationPage.url);
    const informationPage = new InformationPage(page);

    await expect(informationPage.heading).toBeVisible();
    await expect(informationPage.visitFrequencyHeading).toBeVisible();
    await expect(informationPage.rankingHeading).toBeVisible();
    // Populated-state content is inline prose (no <table>). Confirm data is present by
    // checking two stable labels that only appear once the account has hits.
    await expect(informationPage.todayCount).toBeVisible();
    await expect(informationPage.topPage).toBeVisible();
  });
});

test.describe('information page (empty account)', { tag: '@regression' }, () => {
  test.use({ storageState: EMPTY_STORAGE_STATE });

  test('shows "no hits in last 30 days" empty-state message', async ({ page }) => {
    await page.goto(InformationPage.url);
    const informationPage = new InformationPage(page);

    await expect(informationPage.heading).toBeVisible();
    await expect(informationPage.emptyStateHeading).toBeVisible();
    await expect(informationPage.visitFrequencyHeading).not.toBeVisible();
    await expect(informationPage.rankingHeading).not.toBeVisible();
  });
});
