import { test, expect } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';
import { StatsPage, USER_PARAMETER_OPTIONS } from '@pages/authenticated/stats.page';
import { expectHeadings } from '@utils/string.util';
import {
  analyzeSvgChart,
  expectEveryParametrChartMatchesTableAndIsDistinct,
  navigateAndWaitForSvgChart,
} from '@utils/svg-chart.util';
import { StatisticsRow } from '@types-local/statistics-row';

test('SVG chart is rendered on /zone/stats/', { tag: '@regression' }, async ({ page }) => {
  const svgResponse = await navigateAndWaitForSvgChart(
    page,
    StatsPage.url,
    StatsPage.svgChartUrl,
    StatsPage.svgChartPreAuthUrl
  );

  await test.step('analyze SVG structure', async () => {
    const svgDom = await analyzeSvgChart(page, await svgResponse.text());

    // chart.php is per-user, so the entry count depends on how many distinct browsers the
    // populated account has visited. Assert structural invariants that hold regardless of
    // entry count: at least one bar, equal counts of rect/text animations, fixed timing.
    expect(svgDom.animateInRectCount).toBeGreaterThan(0);
    expect(svgDom.animateInTextCount).toBe(svgDom.animateInRectCount);
    expect(svgDom.hasWidthAnimation).toBe(true);
    expect(svgDom.hasVisibilityAnimation).toBe(true);
    expect(svgDom.rectAnimateTiming).toEqual({ begin: '0s', dur: '1s' });
    expect(svgDom.textAnimateTiming).toEqual({ begin: '1s', dur: '1s' });
    // Default Parametr is browsers, so the chart's text labels must include at least one
    // mainstream browser name.
    expect(svgDom.browsers).toEqual(
      expect.arrayContaining([expect.stringMatching(/Chrome|Firefox|Safari/)])
    );
  });
});

// Mirrors the public `system statistics` test in `tests/statistics.spec.ts`: covers every
// non-chart label and structural element on /zone/stats/ (heading, dimension + period
// controls, period round-trip, table column headers, data row format, footer rows). The
// per-user page renders the same form and table structure as the public page, so most
// pinned strings are kept in sync via the StatsPage / ServiceStatisticsPage constants —
// only the main heading and the Parametr option set differ (per-user adds 6 user-only
// dimensions; see USER_PARAMETER_OPTIONS).
test('user statistics', { tag: '@regression' }, async ({ page }) => {
  const statsPage = new StatsPage(page);

  await test.step('navigate to page', async () => {
    await page.goto(StatsPage.url);
  });

  await test.step('verify page headings', async () => {
    await expectHeadings(page, [StatsPage.statistics, AbstractPage.signIn]);
  });

  await test.step('verify dimension + submit controls', async () => {
    await expect(statsPage.parameterCombobox).toBeVisible();
    await expect(statsPage.showStatisticsSubmit).toBeVisible();
  });

  await test.step('verify period selector round-trip', async () => {
    // App is served as application/xhtml+xml, so element.nodeName is lowercase
    // ('select' not 'SELECT'). Playwright's toHaveValue / inputValue rejects this with
    // "Not an input element" — read .value via evaluate() instead.
    const period = page.getByRole('combobox', { name: StatsPage.periodLabel, exact: true });
    await expect(period).toBeVisible();
    await expect.poll(() => period.evaluate((el: HTMLSelectElement) => el.value)).toBe('30');

    await period.selectOption('90');
    await statsPage.showStatisticsSubmit.click();

    await expect.poll(() => period.evaluate((el: HTMLSelectElement) => el.value)).toBe('90');
  });

  await test.step('verify table headers', async () => {
    await expect(
      page.getByRole('columnheader', { name: StatsPage.colLp, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: StatsPage.colBrowsers, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: StatsPage.colCount, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: StatsPage.colPercent, exact: true })
    ).toBeVisible();
  });

  await test.step('verify data rows', async () => {
    const rows = page.getByRole('table').first().getByRole('row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Read all data rows in one browser round-trip to avoid sequential awaits timing out
    // on accounts with many rows.
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
    await expect(rows.nth(rowCount - 3)).toContainText(StatsPage.totalRecognized);
    await expect(rows.nth(rowCount - 2)).toContainText(StatsPage.unrecognized);
    await expect(rows.last()).toContainText(StatsPage.total);

    // Verify footer row values (count and percent) – located by content, not by index.
    const totalRecognized = rows.filter({ hasText: StatsPage.totalRecognized });
    await expect(totalRecognized).toHaveCount(1);
    await expect(totalRecognized.getByRole('cell').nth(2)).toHaveText(/^\d+$/);
    await expect(totalRecognized.getByRole('cell').nth(3)).toHaveText('100%');

    const unrecognized = rows.filter({ hasText: StatsPage.unrecognized });
    await expect(unrecognized).toHaveCount(1);
    await expect(unrecognized.getByRole('cell').nth(2)).toHaveText(/^\d+$/);
    await expect(unrecognized.getByRole('cell').nth(3)).toHaveText('-');

    // 'Łącznie' is a substring of 'Łącznie rozpoznane'; use exact cell name to avoid matching both
    const total = rows.filter({
      has: page.getByRole('cell', { name: StatsPage.total, exact: true }),
    });
    await expect(total).toHaveCount(1);
    await expect(total.getByRole('cell').nth(2)).toHaveText(/^\d+$/);
    await expect(total.getByRole('cell').nth(3)).toHaveText('-');
  });
});

// Walk every "Pokaż statystyki" Parametr option once: assert chart=table top-N rows for
// each dimension AND that every dimension renders a distinct chart. /zone/stats/ has 12
// Parametr options (6 shared with /statistics/ + 6 user-only — see USER_PARAMETER_OPTIONS),
// so this covers the full per-user surface, not just the public-page subset.
test(
  'every Parametr chart matches the data table and is distinct on /zone/stats/',
  { tag: '@regression' },
  async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(StatsPage.url);
    const statsPage = new StatsPage(page);
    await expectEveryParametrChartMatchesTableAndIsDistinct(
      page,
      {
        combobox: statsPage.parameterCombobox,
        submit: statsPage.showStatisticsSubmit,
        svgChartUrlFragment: StatsPage.svgChartUrl,
      },
      USER_PARAMETER_OPTIONS
    );
  }
);
