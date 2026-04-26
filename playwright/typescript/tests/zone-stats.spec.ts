import { test, expect } from '@fixtures/base.fixture';
import { StatsPage } from '@pages/authenticated/stats.page';
import { PARAMETER_OPTIONS } from '@pages/public/service-statistics.page';
import { navigateAndWaitForSvgChart } from '@utils/svg-chart.util';

test('SVG chart is rendered on /zone/stats/', { tag: '@regression' }, async ({ page }) => {
  await navigateAndWaitForSvgChart(
    page,
    StatsPage.url,
    StatsPage.svgChartUrl,
    StatsPage.svgChartPreAuthUrl
  );
});

// Each "Pokaż statystyki" Parametr option submits the form and reloads the per-user chart
// with a different dimension. Verify every option round-trips and produces non-empty data.
for (const option of PARAMETER_OPTIONS) {
  test(
    `Pokaż statystyki — ${option.label} produces non-empty data on /zone/stats/`,
    { tag: '@regression' },
    async ({ page }) => {
      await page.goto(StatsPage.url);

      const statsPage = new StatsPage(page);
      await statsPage.parameterCombobox.selectOption(option.value);

      await Promise.all([
        page.waitForResponse((r) => r.url().includes(StatsPage.svgChartUrl)),
        statsPage.showStatisticsSubmit.click(),
      ]);

      await expect
        .poll(() => statsPage.parameterCombobox.evaluate((el: HTMLSelectElement) => el.value))
        .toBe(option.value);

      await expect(page.locator('object[type="image/svg+xml"]')).toBeVisible();
      const rows = page.getByRole('table').first().getByRole('row');
      expect(await rows.count()).toBeGreaterThan(4);
    }
  );
}
