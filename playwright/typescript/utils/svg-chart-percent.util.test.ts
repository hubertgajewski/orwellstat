import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  CHART_TABLE_TOLERANCE_HUNDREDTHS,
  chartTablePercentGapHundredths,
  stripSvgPercentBrackets,
} from './svg-chart-percent.util.ts';

describe('stripSvgPercentBrackets', () => {
  test('removes a leading [ and trailing ]', () => {
    assert.equal(stripSvgPercentBrackets('[39.67%]'), '39.67%');
  });

  test('returns unbracketed input unchanged', () => {
    assert.equal(stripSvgPercentBrackets('39.67%'), '39.67%');
  });
});

describe('chartTablePercentGapHundredths', () => {
  test('returns 0 when chart and table render identical percentages', () => {
    assert.equal(chartTablePercentGapHundredths('[28.78%]', '28.78%'), 0);
  });

  test('returns the absolute integer-hundredths gap regardless of which side is larger', () => {
    assert.equal(chartTablePercentGapHundredths('[28.78%]', '28.76%'), 2);
    assert.equal(chartTablePercentGapHundredths('[28.76%]', '28.78%'), 2);
  });

  test('matches the empirically observed Mobile Chrome / Webkit gap (4 hundredths)', () => {
    // Sourced from the CI runs cited in issue #382 — `Przeglądarki i inne aplikacje WWW`
    // row 1 and `Rozdzielczość ekranu` row 1 on Mobile Chrome.
    assert.equal(chartTablePercentGapHundredths('[41.94%]', '41.90%'), 4);
    assert.equal(chartTablePercentGapHundredths('[61.08%]', '61.05%'), 3);
  });

  test('is immune to IEEE-754 artefacts at the half-cent boundary', () => {
    // Direct subtraction would yield 0.010000000000001563 here; rounding to integer
    // hundredths first keeps the result exactly 1.
    assert.equal(chartTablePercentGapHundredths('[28.50%]', '28.49%'), 1);
  });
});

describe('CHART_TABLE_TOLERANCE_HUNDREDTHS bound', () => {
  test('admits gaps up to and including 5 hundredths (±0.05 pp)', () => {
    assert.ok(
      chartTablePercentGapHundredths('[10.00%]', '10.04%') <= CHART_TABLE_TOLERANCE_HUNDREDTHS
    );
    assert.ok(
      chartTablePercentGapHundredths('[10.00%]', '10.05%') <= CHART_TABLE_TOLERANCE_HUNDREDTHS
    );
  });

  test('rejects a synthetic 0.10 pp gap (10 hundredths) so wider tolerance does not mask real divergence', () => {
    // Per issue #382 DoD: the wider tolerance must still flag a real rendering bug where
    // chart and table disagree by 0.10 percentage points or more.
    assert.ok(
      chartTablePercentGapHundredths('[10.00%]', '10.10%') > CHART_TABLE_TOLERANCE_HUNDREDTHS
    );
    assert.ok(
      chartTablePercentGapHundredths('[41.94%]', '25.00%') > CHART_TABLE_TOLERANCE_HUNDREDTHS
    );
  });
});
