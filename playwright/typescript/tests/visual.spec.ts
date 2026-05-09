import { test, expect, type Locator, type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';
import { HomePage } from '@pages/public/home.page';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { ContactPage } from '@pages/public/contact.page';
import { ServiceStatisticsPage } from '@pages/public/service-statistics.page';
import { RegisterPage } from '@pages/public/register.page';
import { PasswordResetPage } from '@pages/public/password-reset.page';
import { PreviouslyAddedPage } from '@pages/public/previously-added.page';
import {
  InformationPage,
  INFORMATION_LIVE_DATA_MASK_COUNT,
} from '@pages/authenticated/information.page';
import { StatsPage } from '@pages/authenticated/stats.page';
import { HitsPage } from '@pages/authenticated/hits.page';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { AdminPage } from '@pages/authenticated/admin.page';
import {
  STYLE_SELECTOR,
  STYLE_IRISH_GREEN_SVG,
  STYLE_PURPLE_RAIN,
  STYLE_HIGH_CONTRAST,
  STYLE_PRINT,
} from '@pages/common';
import { navigateAndWaitForSvgChart } from '@utils/svg-chart.util';

// All selectable styles; Irish Green SVG is the server default.
const ALL_STYLES = [
  STYLE_IRISH_GREEN_SVG,
  STYLE_PURPLE_RAIN,
  STYLE_HIGH_CONTRAST,
  STYLE_PRINT,
] as const satisfies readonly string[];

const STABLE_TABLE_ROW_COUNT = 5;

async function trimTableRows(
  page: Page,
  tableSelector: string,
  keepRows = STABLE_TABLE_ROW_COUNT
): Promise<void> {
  await page.evaluate<void, { tableSelector: string; keepRows: number }>(
    ({ tableSelector: selector, keepRows: rowCount }) => {
      const table = document.querySelector<HTMLTableElement>(selector);
      if (!table) return;
      Array.from(table.rows)
        .slice(rowCount)
        .forEach((row) => row.parentNode?.removeChild(row));
    },
    { tableSelector, keepRows }
  );
}

async function visibleLoggedInUsername(page: Page): Promise<Locator> {
  const username = AbstractPage.loggedInUsername(page);
  await expect(username).toBeVisible();
  return username;
}

test('home page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(HomePage.url);
  const username = await visibleLoggedInUsername(page);
  // The two lists inside #statsbar contain newly added browsers and OSes which change over
  // time; mask both to keep the baseline stable. #statsbar contains no other lists.
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [page.locator('#statsbar').getByRole('list'), username],
  });
});

for (const style of ALL_STYLES) {
  test(`home page visual regression - ${style} style`, { tag: '@regression' }, async ({ page }) => {
    await page.goto(HomePage.url);
    await page.getByRole('combobox', { name: STYLE_SELECTOR }).selectOption(style);
    await page.getByRole('button', { name: STYLE_SELECTOR }).click();
    try {
      const username = await visibleLoggedInUsername(page);
      await expect(page).toHaveScreenshot({
        fullPage: true,
        mask: [page.locator('#statsbar').getByRole('list'), username],
      });
    } finally {
      // Delete the SelectedStyle cookie — it is stored server-side in the session shared by
      // all tests via .auth/populated.json, so not cleaning up would cause subsequent tests
      // to render in the selected style and fail their baselines.
      await page.context().clearCookies({ name: 'SelectedStyle' });
    }
  });
}

test('about system page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(AboutSystemPage.url);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({ fullPage: true, mask: [username] });
});

for (const style of ALL_STYLES) {
  test(
    `about system page visual regression - ${style} style`,
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(AboutSystemPage.url);
      await page.getByRole('combobox', { name: STYLE_SELECTOR }).selectOption(style);
      await page.getByRole('button', { name: STYLE_SELECTOR }).click();
      try {
        const username = await visibleLoggedInUsername(page);
        await expect(page).toHaveScreenshot({ fullPage: true, mask: [username] });
      } finally {
        await page.context().clearCookies({ name: 'SelectedStyle' });
      }
    }
  );
}

test('contact page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(ContactPage.url);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({ fullPage: true, mask: [username] });
});

for (const style of ALL_STYLES) {
  test(
    `contact page visual regression - ${style} style`,
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(ContactPage.url);
      await page.getByRole('combobox', { name: STYLE_SELECTOR }).selectOption(style);
      await page.getByRole('button', { name: STYLE_SELECTOR }).click();
      try {
        const username = await visibleLoggedInUsername(page);
        await expect(page).toHaveScreenshot({ fullPage: true, mask: [username] });
      } finally {
        await page.context().clearCookies({ name: 'SelectedStyle' });
      }
    }
  );
}

test('statistics page visual regression', { tag: '@regression' }, async ({ page }) => {
  // Wait for the SVG chart response before screenshotting to ensure it is fully loaded.
  // animations: 'disabled' freezes the SVG animation for a stable baseline.
  // The statistics table and SVG chart contain live data that changes frequently; mask both
  // to keep the baseline stable while still verifying page structure.
  await navigateAndWaitForSvgChart(
    page,
    ServiceStatisticsPage.url,
    ServiceStatisticsPage.svgChartUrl,
    ServiceStatisticsPage.svgChartPreAuthUrl
  );
  // Remove all but the first 5 rows (1 header + 4 data rows) from the statistics table so the table height —
  // and therefore the footer position — is stable regardless of how many browser/OS rows
  // live data contains. CSS overflow tricks don't work here: overflow:hidden clips visually
  // but Playwright's fullPage screenshot and mask both use the element's full bounding box,
  // so the only reliable fix is to physically remove rows from the DOM.
  // Table content is already masked below so removing rows does not affect correctness.
  await trimTableRows(page, ServiceStatisticsPage.statisticsTableSelector);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    animations: 'disabled',
    mask: [page.getByRole('table'), page.locator('object[type="image/svg+xml"]'), username],
  });
});

// Irish Green SVG and Wersja do druku render the SVG chart on the statistics page;
// these variants retain the full SVG wait and DOM stabilisation logic.
for (const style of [STYLE_IRISH_GREEN_SVG, STYLE_PRINT] as const) {
  test(
    `statistics page visual regression - ${style} style`,
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(ServiceStatisticsPage.url);
      await page.getByRole('combobox', { name: STYLE_SELECTOR }).selectOption(style);
      // Style form may redirect away; wait for the navigation to start before proceeding.
      await Promise.all([
        page.waitForURL('**'),
        page.getByRole('button', { name: STYLE_SELECTOR }).click(),
      ]);
      try {
        await navigateAndWaitForSvgChart(
          page,
          ServiceStatisticsPage.url,
          ServiceStatisticsPage.svgChartUrl,
          ServiceStatisticsPage.svgChartPreAuthUrl
        );
        await trimTableRows(page, ServiceStatisticsPage.statisticsTableSelector);
        const username = await visibleLoggedInUsername(page);
        await expect(page).toHaveScreenshot({
          fullPage: true,
          animations: 'disabled',
          mask: [page.getByRole('table'), page.locator('object[type="image/svg+xml"]'), username],
        });
      } finally {
        await page.context().clearCookies({ name: 'SelectedStyle' });
      }
    }
  );
}

// Purple Rain and Wysoki kontrast do not render the SVG chart on the statistics page.
for (const style of [STYLE_PURPLE_RAIN, STYLE_HIGH_CONTRAST] as const) {
  test(
    `statistics page visual regression - ${style} style`,
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(ServiceStatisticsPage.url);
      await page.getByRole('combobox', { name: STYLE_SELECTOR }).selectOption(style);
      // Style form may redirect away; wait for the navigation to start before proceeding.
      await Promise.all([
        page.waitForURL('**'),
        page.getByRole('button', { name: STYLE_SELECTOR }).click(),
      ]);
      try {
        await page.goto(ServiceStatisticsPage.url);
        await trimTableRows(page, ServiceStatisticsPage.statisticsTableSelector);
        const username = await visibleLoggedInUsername(page);
        await expect(page).toHaveScreenshot({
          fullPage: true,
          animations: 'disabled',
          mask: [page.getByRole('table'), username],
        });
      } finally {
        await page.context().clearCookies({ name: 'SelectedStyle' });
      }
    }
  );
}

test('register page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(RegisterPage.url);
  const registerPage = new RegisterPage(page);
  const username = await visibleLoggedInUsername(page);
  await expect(registerPage.blockIpField).toBeVisible();
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [registerPage.blockIpField, username],
  });
});

test('password reset page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(PasswordResetPage.url);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [username],
  });
});

test('previously added page visual regression', { tag: '@regression' }, async ({ page }) => {
  // The page renders dynamic browser/OS lists inside #statsbar; match the home page
  // approach and mask both via getByRole('list') before capturing the baseline.
  await page.goto(PreviouslyAddedPage.url);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [page.locator('#statsbar').getByRole('list'), username],
  });
});

test('information page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(InformationPage.url);
  const informationPage = new InformationPage(page);
  await expect(informationPage.heading).toBeVisible();
  await expect(informationPage.visitFrequencyHeading).toBeVisible();
  await expect(informationPage.rankingHeading).toBeVisible();
  const liveDataMasks = await informationPage.markLiveDataForVisualRegression();
  const username = await visibleLoggedInUsername(page);
  await expect(liveDataMasks).toHaveCount(INFORMATION_LIVE_DATA_MASK_COUNT);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [liveDataMasks, username],
  });
});

test('stats page visual regression', { tag: '@regression' }, async ({ page }) => {
  const statsPage = new StatsPage(page);
  await navigateAndWaitForSvgChart(
    page,
    StatsPage.url,
    StatsPage.svgChartUrl,
    StatsPage.svgChartPreAuthUrl
  );
  // Keep the page height stable while still capturing the form and table placement.
  // The table data and SVG chart are live per-user traffic data, mirroring the public
  // /statistics/ handling above: trim excess rows and mask the volatile regions.
  await trimTableRows(page, StatsPage.statisticsTableSelector);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    animations: 'disabled',
    mask: [statsPage.statisticsTable, statsPage.svgChart, username],
  });
});

test('hits page visual regression', { tag: '@regression' }, async ({ page }) => {
  const hitsPage = new HitsPage(page);
  await hitsPage.goto();
  await expect(hitsPage.heading).toBeVisible();
  await expect(hitsPage.resultsTable).toBeVisible();
  // /zone/hits/ has live hit rows. Match the statistics-page strategy: keep the
  // surrounding form/table layout covered, trim the table to a stable height, and mask
  // the volatile hit details rather than committing changing account data.
  await trimTableRows(page, HitsPage.resultsTableSelector);
  const username = await visibleLoggedInUsername(page);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [hitsPage.resultsTable, username],
  });
});

test('scripts page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(ScriptsPage.url);
  const scriptsPage = new ScriptsPage(page);
  const username = await visibleLoggedInUsername(page);
  await expect(scriptsPage.heading).toBeVisible();
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [scriptsPage.html5Snippet, scriptsPage.html4Snippet, scriptsPage.xhtmlSnippet, username],
  });
});

test('admin page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(AdminPage.url);
  const adminPage = new AdminPage(page);
  await expect(adminPage.heading).toBeVisible();
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [
      adminPage.settingsUsername,
      adminPage.loggedInUsername,
      adminPage.emailField,
      adminPage.blockIpField,
    ],
  });
});
