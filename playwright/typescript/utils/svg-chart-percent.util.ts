// Pure helpers for comparing the SVG chart's percentage labels against the data table's
// percentage cells. Kept Playwright-free so the node-native unit suite can import them
// without pulling in `@fixtures/base.fixture` (mirrors the `css-validator.util.ts` split).

// Strip the bracket wrapper the SVG uses around percentages ("[39.67%]" → "39.67%") so the
// value can be compared directly against the data table cell.
export function stripSvgPercentBrackets(svgPercent: string): string {
  return svgPercent.replace(/^\[|\]$/g, '');
}

// Maximum acceptable per-row gap between the SVG chart's percentage label and the data
// table's percentage cell, expressed in integer hundredths of a percent (i.e. ±0.05 pp).
//
// The chart and the table are produced by independent sub-requests: the SVG is fetched
// out-of-line via an `<object>` pointed at `chart.php` / `chart_all.php`, while the table
// is rendered inline by the page itself. This split predates inline-SVG support and exists
// because the page must validate as XHTML 1.0 Strict (which forbids inline `<svg>`) for
// the vintage browsers Orwell Stat still serves; XHTML 1.1 + SVG was rejected for the
// same audience reason. The two paths round/truncate the percentage independently, so a
// small per-row disagreement is structural, not a regression. Empirically, gaps up to 4
// hundredths have been observed on Mobile Chrome and Webkit (Przeglądarki, Rozdzielczość
// ekranu) — see issue #382 for the CI runs that motivated this bound.
export const CHART_TABLE_TOLERANCE_HUNDREDTHS = 5;

// Compute the absolute gap between an SVG chart percent label (bracketed form like
// "[28.78%]") and a data table percent cell ("28.76%"), expressed in integer hundredths
// of a percent. Both sides are rounded to integer hundredths before subtracting to dodge
// IEEE-754 artefacts (e.g. the direct subtraction 28.50 − 28.49 evaluates to
// 0.0100000000000016, which would spuriously fail a `< 0.01` form on legitimate
// rounding-direction disagreements).
export function chartTablePercentGapHundredths(svgPercent: string, tablePercent: string): number {
  const svgAt2Decimals = Math.round(parseFloat(stripSvgPercentBrackets(svgPercent)) * 100);
  const tableAt2Decimals = Math.round(parseFloat(tablePercent) * 100);
  return Math.abs(svgAt2Decimals - tableAt2Decimals);
}
