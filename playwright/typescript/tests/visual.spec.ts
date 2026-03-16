import { test, expect } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { ContactPage } from '@pages/public/contact.page';
import { ServiceStatisticsPage } from '@pages/public/service-statistics.page';

test('home page visual regression', async ({ page }) => {
  await page.goto(HomePage.url);
  // The two lists inside #statsbar contain newly added browsers and OSes which change over
  // time; mask both to keep the baseline stable. #statsbar contains no other lists.
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [page.locator('#statsbar').getByRole('list')],
  });
});

test('home page visual regression - Purple Rain style', async ({ page }) => {
  await page.goto(HomePage.url);
  // Select a non-default style and submit; each style gets its own baseline.
  await page
    .getByRole('combobox', { name: HomePage.styleSelector })
    .selectOption(HomePage.stylePurpleRain);
  await page.getByRole('button', { name: HomePage.styleSelector }).click();
  try {
    await expect(page).toHaveScreenshot({
      fullPage: true,
      mask: [page.locator('#statsbar').getByRole('list')],
    });
  } finally {
    // Delete the SelectedStyle cookie — it is stored server-side in the session shared by
    // all tests via .auth/user.json, so not cleaning up would cause subsequent tests to
    // render in Purple Rain and fail their baselines.
    await page.context().clearCookies({ name: 'SelectedStyle' });
  }
});

test('about system page visual regression', async ({ page }) => {
  await page.goto(AboutSystemPage.url);
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test('contact page visual regression', async ({ page }) => {
  await page.goto(ContactPage.url);
  await expect(page).toHaveScreenshot({ fullPage: true });
});

test('statistics page visual regression', async ({ page }) => {
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
