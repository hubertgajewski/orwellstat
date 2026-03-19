import { test, expect } from '@fixtures/base.fixture';
import { ServiceStatisticsPage } from '@pages/public/service-statistics.page';

const SVG_CONTENT_TYPE = 'image/svg+xml';
const W3C_MARKUP_VALIDATOR = 'https://validator.w3.org/check';

// Minimal valid SVG returned instead of the animated chart — no timing variables, deterministic render
const STATIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="steelblue"/></svg>`;

type W3cResponse = {
  messages: Array<{ type: string; message: string; lastLine?: number }>;
};

test.describe('network mocking with page.route()', { tag: '@regression' }, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Network mocking tests run on Chromium only'
  );

  test('SVG chart renders with mocked static response', async ({ page }) => {
    // Intercept the chart sub-resource loaded by the <object> element and return a static SVG.
    // This eliminates animation timing variability: the chart is visible and deterministic
    // regardless of how long the real endpoint takes.
    await page.route(`**/${ServiceStatisticsPage.svgChartUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: SVG_CONTENT_TYPE,
        body: STATIC_SVG,
      });
    });

    await page.goto(ServiceStatisticsPage.url);
    await expect(page.locator(`object[type="${SVG_CONTENT_TYPE}"]`)).toBeVisible();
  });

  test('W3C validation errors are detected from mocked response', async ({ page }) => {
    // Intercept requests to the W3C markup validator and return a controlled error payload.
    // The fetch is made from within page.evaluate() so it goes through the browser context
    // and is intercepted by page.route() — this is a negative test that would be impossible
    // to run reliably against the live validator (rate limiting, downtime).
    await page.route(`${W3C_MARKUP_VALIDATOR}**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [{ type: 'error', message: 'Stray end tag div', lastLine: 42 }],
        }),
      });
    });

    await page.goto('about:blank');

    const result = await page.evaluate<W3cResponse, string>(async (url) => {
      const response = await fetch(`${url}?output=json`);
      return response.json();
    }, W3C_MARKUP_VALIDATOR);

    const errors = result.messages.filter(
      (m) => m.type === 'error' || m.type === 'non-document-error'
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Stray end tag div');
  });
});
