import { test, expect } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { ContactPage } from '@pages/public/contact.page';
import { ServiceStatisticsPage } from '@pages/public/service-statistics.page';

test('home page visual regression', async ({ page }) => {
  await page.goto(HomePage.url);
  // The #nowosci section lists newly added browsers and OSes which change over time;
  // mask it to keep the baseline stable while still verifying page structure.
  await expect(page).toHaveScreenshot({ fullPage: true, mask: [page.locator('#nowosci')] });
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
