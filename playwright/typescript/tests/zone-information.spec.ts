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

    // Visit-frequency line: both halves ("Dzisiaj: N" and "w ciągu ostatnich 30 dni: N.")
    // must carry numbers; checking only the label would pass on an empty value.
    await expect(informationPage.visitFrequencyLine).toBeVisible();

    // Ranking lines: each must show label + non-empty value + percentage + count.
    await expect(informationPage.topHostLine).toBeVisible();
    await expect(informationPage.peakDayLine).toBeVisible();
    await expect(informationPage.topBrowserLine).toBeVisible();
    await expect(informationPage.topOsLine).toBeVisible();
    await expect(informationPage.topLanguageLine).toBeVisible();
    await expect(informationPage.topCountryLine).toBeVisible();
    await expect(informationPage.topPageLine).toBeVisible();
    await expect(informationPage.topResolutionLine).toBeVisible();
    await expect(informationPage.topColorDepthLine).toBeVisible();

    await expect(informationPage.footerNote).toBeVisible();
    await expect(informationPage.peakDayLink).toHaveAttribute('href', /\/zone\/hits\//);
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

    // Without hits, none of the populated-state content (sample ranking line, footer
    // prose, peak-day link) should appear either.
    await expect(informationPage.visitFrequencyLine).not.toBeVisible();
    await expect(informationPage.topHostLine).not.toBeVisible();
    await expect(informationPage.footerNote).not.toBeVisible();
    await expect(informationPage.peakDayLink).not.toBeVisible();
  });
});
