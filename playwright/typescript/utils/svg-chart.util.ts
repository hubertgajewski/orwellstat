import { type Page, expect } from '@fixtures/base.fixture';

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

// Wait for the chart to reload after submitting the "Pokaż statystyki" form. Returns the
// response so callers can assert content-type / status if needed.
export async function submitAndWaitForSvgChart(
  page: Page,
  svgChartUrlFragment: string,
  submit: () => Promise<void>
): Promise<import('@playwright/test').Response> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(svgChartUrlFragment)),
    submit(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('svg');
  return response;
}
