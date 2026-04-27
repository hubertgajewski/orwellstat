import { type Locator, type Page, expect } from '@fixtures/base.fixture';
import type { SvgAnalysis } from '@types-local/svg-analysis';
import {
  CHART_TABLE_TOLERANCE_HUNDREDTHS,
  chartTablePercentGapHundredths,
} from './svg-chart-percent.util.ts';

// Navigate to `pageUrl` and wait for the SVG chart sub-resource (`chart.php` /
// `chart_all.php`) to load. On staging, Firefox does not cache Basic Auth credentials for
// <object> sub-resources, so optionally pre-navigate to `preAuthUrl` first to prime the cache.
export async function navigateAndWaitForSvgChart(
  page: Page,
  pageUrl: string,
  svgChartUrlFragment: string,
  preAuthUrl?: string
): Promise<import('@playwright/test').Response> {
  if (preAuthUrl && process.env.BASIC_AUTH_USER) {
    const preAuthResponse = await page.goto(preAuthUrl);
    expect(preAuthResponse?.status()).toBe(200);
  }

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(svgChartUrlFragment)),
    page.goto(pageUrl),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('svg');

  await expect(page.locator('object[type="image/svg+xml"]')).toBeVisible();

  return response;
}

// Parse the SVG chart's animation structure from raw SVG content. Returns counts, timing,
// and the non-percentage `<text>` labels (which are the row labels of the bar chart).
export async function analyzeSvgChart(page: Page, svgContent: string): Promise<SvgAnalysis> {
  return page.evaluate<SvgAnalysis, string>((svg) => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return {
      animateInRectCount: doc.querySelectorAll('rect > animate').length,
      animateInTextCount: doc.querySelectorAll('text > animate').length,
      hasWidthAnimation: doc.querySelector('animate[attributeName="width"]') !== null,
      hasVisibilityAnimation: doc.querySelector('animate[attributeName="visibility"]') !== null,
      rectAnimateTiming: (() => {
        const el = doc.querySelector('rect > animate');
        return el ? { begin: el.getAttribute('begin'), dur: el.getAttribute('dur') } : null;
      })(),
      textAnimateTiming: (() => {
        const el = doc.querySelector('text > animate');
        return el ? { begin: el.getAttribute('begin'), dur: el.getAttribute('dur') } : null;
      })(),
      browsers: Array.from(doc.querySelectorAll('text'))
        .map((el) => el.textContent?.trim())
        .filter((t) => t && !t.includes('%')),
    };
  }, svgContent);
}

// One row of the rendered SVG chart: the dimension label and its percentage in the
// bracketed form the chart uses ("[39.67%]"). The SVG <text> nodes appear in label/percent
// pairs in document order, mirroring the order of the data table's top-N rows.
export interface SvgChartPair {
  readonly label: string;
  readonly percent: string;
}

export async function svgChartPairs(page: Page, svgContent: string): Promise<SvgChartPair[]> {
  return page.evaluate<SvgChartPair[], string>((svg) => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const texts = Array.from(doc.querySelectorAll('text')).map(
      (el) => el.textContent?.trim() ?? ''
    );
    const pairs: { label: string; percent: string }[] = [];
    for (let i = 0; i + 1 < texts.length; i += 2) {
      pairs.push({ label: texts[i], percent: texts[i + 1] });
    }
    return pairs;
  }, svgContent);
}

// Read the first N data rows of the statistics table — i.e. the rows that the SVG chart
// visualises. The chart is capped at the top 10 distinct values; the table includes those
// plus tail entries plus 3 footer rows. Pass N = chart entry count to cross-check.
export interface DataTableRow {
  readonly label: string;
  readonly percent: string;
}

export async function dataTableTopRows(page: Page, n: number): Promise<DataTableRow[]> {
  return page.evaluate<DataTableRow[], number>((count) => {
    const t = document.querySelector('table');
    if (!t) return [];
    return Array.from(t.rows)
      .slice(1, count + 1)
      .map((r) => ({
        label: r.cells[1]?.textContent?.trim() ?? '',
        percent: r.cells[3]?.textContent?.trim() ?? '',
      }));
  }, n);
}

// Walk every `Pokaż statystyki` Parametr option on the current page. For each option:
// switch the combobox, submit, wait for the chart to reload, assert the round-trip held,
// and assert the chart's label/percent pairs match the data table's top-N rows. Then
// assert each dimension renders a distinct chart so switching the Parametr is not a
// server-side no-op.
//
// Percent comparison uses a tolerance because the data table rounds to 2 decimals
// (e.g. "0.00%") while the SVG keeps the underlying precision (e.g. "[0.004%]").
//
// `combobox` and `submit` are passed as locators so the helper stays decoupled from any
// specific page class (`/statistics/` and `/zone/stats/` use the same form structure).
export async function expectEveryParametrChartMatchesTableAndIsDistinct(
  page: Page,
  ctx: {
    readonly combobox: Locator;
    readonly submit: Locator;
    readonly svgChartUrlFragment: string;
  },
  options: readonly {
    readonly value: string;
    readonly label: string;
    readonly chartLabelIsRank?: boolean;
  }[]
): Promise<void> {
  // Per-dimension table-label list. Used both for the per-row chart=table assertions and
  // for the cross-dimension distinctness check. The table always carries the real text
  // (URL, host, user-agent) — the chart sometimes substitutes rank numbers for legibility,
  // so chart labels are unsuitable as a distinctness key.
  const tableLabelsByOption = new Map<string, string[]>();

  // Verify every option's visible text matches the pinned label up-front. selectOption()
  // below dispatches by value attribute, so a label-only typo (missing diacritic, casing
  // drift, etc.) would never fail the rest of the test — assert the rendered text
  // explicitly so a mismatch on either /statistics/ or /zone/stats/ surfaces immediately.
  for (const option of options) {
    const renderedLabel = await ctx.combobox.evaluate(
      (el: HTMLSelectElement, value: string) =>
        Array.from(el.options)
          .find((o) => o.value === value)
          ?.textContent?.trim() ?? null,
      option.value
    );
    expect
      .soft(renderedLabel, `Parametr option for value "${option.value}": rendered text`)
      .toBe(option.label);
  }

  for (const option of options) {
    await ctx.combobox.selectOption(option.value);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(ctx.svgChartUrlFragment), { timeout: 60_000 }),
      ctx.submit.click(),
    ]);

    await expect
      .poll(() => ctx.combobox.evaluate((el: HTMLSelectElement) => el.value))
      .toBe(option.value);
    await expect(page.locator('object[type="image/svg+xml"]')).toBeVisible();

    const pairs = await svgChartPairs(page, await response.text());
    expect.soft(pairs.length, `${option.label}: chart has at least one row`).toBeGreaterThan(0);
    if (pairs.length === 0) continue;

    const tableTop = await dataTableTopRows(page, pairs.length);
    expect
      .soft(tableTop.length, `${option.label}: table has same top-${pairs.length}`)
      .toBe(pairs.length);

    for (let i = 0; i < Math.min(pairs.length, tableTop.length); i++) {
      // Long-text dimensions (URL, host, user-agent) render rank numbers ("1", "2", …) in
      // the chart instead of the row's text — keeping the chart legible. The data table
      // still shows the full text in cells[1]; assert against the row's Lp in that case.
      const expectedChartLabel = option.chartLabelIsRank ? String(i + 1) : tableTop[i].label;
      expect
        .soft(
          pairs[i].label,
          option.chartLabelIsRank
            ? `${option.label} row ${i + 1}: chart label = row Lp (chart shows rank for long-text dimensions)`
            : `${option.label} row ${i + 1}: chart label = table label`
        )
        .toBe(expectedChartLabel);

      // Compare percentages within ±CHART_TABLE_TOLERANCE_HUNDREDTHS hundredths
      // (i.e. ±0.05 pp). See the constant's docblock for why the chart and table can
      // legitimately disagree by a few hundredths despite reading from the same dataset.
      expect
        .soft(
          chartTablePercentGapHundredths(pairs[i].percent, tableTop[i].percent),
          `${option.label} row ${i + 1}: chart ${pairs[i].percent} ≈ table ${tableTop[i].percent}`
        )
        .toBeLessThanOrEqual(CHART_TABLE_TOLERANCE_HUNDREDTHS);
    }

    tableLabelsByOption.set(
      option.value,
      tableTop.map((r) => r.label)
    );
  }

  // Distinctness uses table labels (always real data) so dimensions that render rank
  // numbers in the chart aren't falsely flagged as identical to each other.
  const labelEntries = Array.from(tableLabelsByOption.entries());
  for (let i = 0; i < labelEntries.length; i++) {
    for (let j = i + 1; j < labelEntries.length; j++) {
      const [valueI, labelsI] = labelEntries[i];
      const [valueJ, labelsJ] = labelEntries[j];
      expect
        .soft(labelsI.join('|'), `Parametr "${valueI}" must render different data than "${valueJ}"`)
        .not.toBe(labelsJ.join('|'));
    }
  }
}
