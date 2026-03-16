import { test, expect } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { ContactPage } from '@pages/public/contact.page';
import { ServiceStatisticsPage } from '@pages/public/service-statistics.page';

test('home page visual regression', async ({ page }) => {
  await page.goto(HomePage.url);
  // The two div.text > ul lists inside #statsbar contain newly added browsers and OSes
  // which change over time; mask them to keep the baseline stable.
  await expect(page).toHaveScreenshot({
    fullPage: true,
    mask: [page.locator('#statsbar > .text > ul')],
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
      mask: [page.locator('#statsbar > .text > ul')],
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
  // The statistics table contains live data that changes frequently, so it is masked
  // to keep the baseline stable while still verifying page structure and the SVG chart.
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(ServiceStatisticsPage.svgChartUrl)),
    page.goto(ServiceStatisticsPage.url),
  ]);
  await expect(page).toHaveScreenshot({
    fullPage: true,
    animations: 'disabled',
    mask: [page.locator('table')],
  });
});
