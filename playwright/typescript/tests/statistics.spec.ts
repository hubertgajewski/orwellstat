import { test, expect, pixelmatch, PNG } from '@fixtures/base.fixture';
import { PARAMETER_OPTIONS, ServiceStatisticsPage } from '@pages/public/service-statistics.page';
import { expectHeadings } from '@utils/string.util';
import {
  analyzeSvgChart,
  expectEveryParametrChartMatchesTableAndIsDistinct,
  navigateAndWaitForSvgChart,
} from '@utils/svg-chart.util';
import { StatisticsRow } from '@types-local/statistics-row';

test('SVG chart is rendered on stats page', { tag: '@regression' }, async ({ page }) => {
  const svgResponse = await test.step('navigate and wait for chart', async () =>
    navigateAndWaitForSvgChart(
      page,
      ServiceStatisticsPage.url,
      ServiceStatisticsPage.svgChartUrl,
      ServiceStatisticsPage.svgChartPreAuthUrl
    ));

  await test.step('verify chart animation', async () => {
    const frame1 = await page.locator('object[type="image/svg+xml"]').screenshot();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const frame2 = await page.locator('object[type="image/svg+xml"]').screenshot();
    expect(frame1).not.toEqual(frame2);

    const img1 = PNG.sync.read(frame1);
    const img2 = PNG.sync.read(frame2);
    const { width, height } = img1;
    const diff = new Uint8Array(width * height * 4);
    const diffPixels = pixelmatch(img1.data, img2.data, diff, width, height, {
      threshold: 0.1,
    });

    expect(diffPixels).toBeGreaterThan(100);
  });

  await test.step('analyze SVG structure', async () => {
    const svgDom = await analyzeSvgChart(page, await svgResponse.text());

    // chart_all.php aggregates every user, so the default browsers dimension is dense enough
    // for the chart to render its full top-10.
    expect(svgDom.animateInRectCount).toBe(10);
    expect(svgDom.animateInTextCount).toBe(10);
    expect(svgDom.hasWidthAnimation).toBe(true);
    expect(svgDom.hasVisibilityAnimation).toBe(true);
    expect(svgDom.rectAnimateTiming).toEqual({ begin: '0s', dur: '1s' });
    expect(svgDom.textAnimateTiming).toEqual({ begin: '1s', dur: '1s' });
    expect(svgDom.browsers).toEqual(
      expect.arrayContaining([expect.stringMatching(/Chrome|Firefox|Safari/)])
    );
  });
});

test('system statistics', { tag: '@regression' }, async ({ page }) => {
  await test.step('navigate to page', async () => {
    await page.goto(ServiceStatisticsPage.url);
  });

  await test.step('verify page headings', async () => {
    await expectHeadings(page, [ServiceStatisticsPage.statistics, ServiceStatisticsPage.signIn]);
  });

  await test.step('verify dimension + submit controls', async () => {
    await expect(
      page.getByRole('combobox', {
        name: ServiceStatisticsPage.parameterLabel,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: ServiceStatisticsPage.showStatisticsSubmitLabel,
        exact: true,
      })
    ).toBeVisible();
  });

  await test.step('verify period selector round-trip', async () => {
    // App is served as application/xhtml+xml, so element.nodeName is lowercase
    // ('select' not 'SELECT'). Playwright's toHaveValue / inputValue rejects
    // this with "Not an input element" — read .value via evaluate() instead.
    const period = page.getByRole('combobox', {
      name: ServiceStatisticsPage.periodLabel,
      exact: true,
    });
    await expect(period).toBeVisible();
    await expect.poll(() => period.evaluate((el: HTMLSelectElement) => el.value)).toBe('30');

    await period.selectOption('90');
    await page
      .getByRole('button', {
        name: ServiceStatisticsPage.showStatisticsSubmitLabel,
        exact: true,
      })
      .click();

    await expect.poll(() => period.evaluate((el: HTMLSelectElement) => el.value)).toBe('90');
  });

  await test.step('verify table headers', async () => {
    await expect(
      page.getByRole('columnheader', {
        name: ServiceStatisticsPage.colLp,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', {
        name: ServiceStatisticsPage.colBrowsers,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', {
        name: ServiceStatisticsPage.colCount,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', {
        name: ServiceStatisticsPage.colPercent,
        exact: true,
      })
    ).toBeVisible();
  });

  await test.step('verify data rows', async () => {
    const rows = page.getByRole('table').first().getByRole('row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Read all data rows in one browser round-trip to avoid 246+ sequential awaits timing out
    const dataRows = await page.evaluate<StatisticsRow[]>(() => {
      const table = document.querySelector('table');
      return table
        ? Array.from(table.rows)
            .slice(1, -3)
            .map((row) => ({
              lp: row.cells[0]?.textContent?.trim() ?? '',
              count: row.cells[2]?.textContent?.trim() ?? '',
              percent: row.cells[3]?.textContent?.trim() ?? '',
            }))
        : [];
    });
    expect(dataRows).toHaveLength(rowCount - 4); // 1 header row + 3 footer rows
    for (let i = 0; i < dataRows.length; i++) {
      expect.soft(dataRows[i].lp, `row ${i + 1}: lp`).toBe(String(i + 1));
      expect.soft(dataRows[i].count, `row ${i + 1}: count`).toMatch(/^\d+$/);
      expect.soft(dataRows[i].percent, `row ${i + 1}: percent`).toMatch(/^\d+\.\d{2}%$/);
    }
  });

  await test.step('verify footer rows', async () => {
    const rows = page.getByRole('table').first().getByRole('row');
    const rowCount = await rows.count();

    // Structural check: the table ends with exactly these 3 footer rows in order
    await expect(rows.nth(rowCount - 3)).toContainText(ServiceStatisticsPage.totalRecognized);
    await expect(rows.nth(rowCount - 2)).toContainText(ServiceStatisticsPage.unrecognized);
    await expect(rows.last()).toContainText(ServiceStatisticsPage.total);

    // Verify footer row values (count and percent) – located by content, not by index
    const totalRecognized = rows.filter({ hasText: ServiceStatisticsPage.totalRecognized });
    await expect(totalRecognized).toHaveCount(1);
    await expect(totalRecognized.getByRole('cell').nth(2)).toHaveText(/^\d+$/);
    await expect(totalRecognized.getByRole('cell').nth(3)).toHaveText('100%');

    const unrecognized = rows.filter({ hasText: ServiceStatisticsPage.unrecognized });
    await expect(unrecognized).toHaveCount(1);
    await expect(unrecognized.getByRole('cell').nth(2)).toHaveText(/^\d+$/);
    await expect(unrecognized.getByRole('cell').nth(3)).toHaveText('-');

    // 'Łącznie' is a substring of 'Łącznie rozpoznane'; use exact cell name to avoid matching both
    const total = rows.filter({
      has: page.getByRole('cell', { name: ServiceStatisticsPage.total, exact: true }),
    });
    await expect(total).toHaveCount(1);
    await expect(total.getByRole('cell').nth(2)).toHaveText(/^\d+$/);
    await expect(total.getByRole('cell').nth(3)).toHaveText('-');
  });
});

// Walk every "Pokaż statystyki" Parametr option once: assert chart=table top-N rows for
// each dimension AND that every dimension renders a distinct chart. One test instead of
// six-plus-one to avoid duplicating the navigation/submit dance per option.
test(
  'every Parametr chart matches the data table and is distinct',
  { tag: '@regression' },
  async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(ServiceStatisticsPage.url);
    const statisticsPage = new ServiceStatisticsPage(page);
    await expectEveryParametrChartMatchesTableAndIsDistinct(
      page,
      {
        combobox: statisticsPage.parameterCombobox,
        submit: statisticsPage.showStatisticsSubmit,
        svgChartUrlFragment: ServiceStatisticsPage.svgChartUrl,
      },
      PARAMETER_OPTIONS
    );
  }
);
