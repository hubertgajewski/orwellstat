import { test, expect } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { ContactPage } from '@pages/public/contact.page';
import { ServiceStatisticsPage } from '@pages/public/service-statistics.page';
import {
  STYLE_SELECTOR,
  STYLE_IRISH_GREEN_SVG,
  STYLE_PURPLE_RAIN,
  STYLE_HIGH_CONTRAST,
  STYLE_PRINT,
} from '@pages/common';

// All selectable styles; Irish Green SVG is the server default.
const ALL_STYLES = [
  STYLE_IRISH_GREEN_SVG,
  STYLE_PURPLE_RAIN,
  STYLE_HIGH_CONTRAST,
  STYLE_PRINT,
] as const satisfies readonly string[];

test('home page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(HomePage.url);
  // The two lists inside #statsbar contain newly added browsers and OSes which change over
  // time; mask both to keep the baseline stable. #statsbar contains no other lists.
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [page.locator('#statsbar').getByRole('list')],
  });
});

for (const style of ALL_STYLES) {
  test(`home page visual regression - ${style} style`, { tag: '@regression' }, async ({ page }) => {
    await page.goto(HomePage.url);
    await page.getByRole('combobox', { name: STYLE_SELECTOR }).selectOption(style);
    await page.getByRole('button', { name: STYLE_SELECTOR }).click();
    try {
      await expect(page).toHaveScreenshot({
        fullPage: true,
        mask: [page.locator('#statsbar').getByRole('list')],
      });
    } finally {
      // Delete the SelectedStyle cookie — it is stored server-side in the session shared by
      // all tests via .auth/user.json, so not cleaning up would cause subsequent tests to
      // render in the selected style and fail their baselines.
      await page.context().clearCookies({ name: 'SelectedStyle' });
    }
  });
}

test('about system page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(AboutSystemPage.url);
  await expect(page).toHaveScreenshot({ fullPage: true });
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
        await expect(page).toHaveScreenshot({ fullPage: true });
      } finally {
        await page.context().clearCookies({ name: 'SelectedStyle' });
      }
    }
  );
}

test('contact page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto(ContactPage.url);
  await expect(page).toHaveScreenshot({ fullPage: true });
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
        await expect(page).toHaveScreenshot({ fullPage: true });
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
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(ServiceStatisticsPage.svgChartUrl)),
    page.goto(ServiceStatisticsPage.url),
  ]);
  // Wait for the <object> to be visible (non-zero dimensions) so its height is stable
  // in the layout before screenshotting; without this the footer may shift after capture.
  await expect(page.locator('object[type="image/svg+xml"]')).toBeVisible();
  // Remove all but the first 5 rows (1 header + 4 data rows) from the statistics table so the table height —
  // and therefore the footer position — is stable regardless of how many browser/OS rows
  // live data contains. CSS overflow tricks don't work here: overflow:hidden clips visually
  // but Playwright's fullPage screenshot and mask both use the element's full bounding box,
  // so the only reliable fix is to physically remove rows from the DOM.
  // Table content is already masked below so removing rows does not affect correctness.
  await page.evaluate<void>(() => {
    const table = document.querySelector<HTMLTableElement>('table');
    if (!table) return;
    Array.from(table.rows)
      .slice(5)
      .forEach((row) => row.parentNode?.removeChild(row));
  });
  await expect(page).toHaveScreenshot({
    fullPage: true,
    animations: 'disabled',
    mask: [page.getByRole('table'), page.locator('object[type="image/svg+xml"]')],
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
      await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes(ServiceStatisticsPage.svgChartUrl)
        ),
        page.goto(ServiceStatisticsPage.url),
      ]);
      await expect(page.locator('object[type="image/svg+xml"]')).toBeVisible();
      await page.evaluate<void>(() => {
        const table = document.querySelector<HTMLTableElement>('table');
        if (!table) return;
        Array.from(table.rows)
          .slice(5)
          .forEach((row) => row.parentNode?.removeChild(row));
      });
      try {
        await expect(page).toHaveScreenshot({
          fullPage: true,
          animations: 'disabled',
          mask: [page.getByRole('table'), page.locator('object[type="image/svg+xml"]')],
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
      await page.goto(ServiceStatisticsPage.url);
      await page.evaluate<void>(() => {
        const table = document.querySelector<HTMLTableElement>('table');
        if (!table) return;
        Array.from(table.rows)
          .slice(5)
          .forEach((row) => row.parentNode?.removeChild(row));
      });
      try {
        await expect(page).toHaveScreenshot({
          fullPage: true,
          animations: 'disabled',
          mask: [page.getByRole('table')],
        });
      } finally {
        await page.context().clearCookies({ name: 'SelectedStyle' });
      }
    }
  );
}
