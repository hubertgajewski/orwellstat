import { test, expect } from '@fixtures/api.fixture';
import { expectValidXhtml, expectValidCss } from '@utils/validation.util';
import { PUBLIC_PAGE_CLASSES } from '@pages/public/index';
import { AUTHENTICATED_PAGE_CLASSES } from '@pages/authenticated/index';
import { HomePage } from '@pages/public/home.page';

test.describe('markup and CSS validation', { tag: '@regression' }, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Validation tests run on Chromium only'
  );

  const xhtmlHeaders = { Accept: 'application/xhtml+xml' };

  for (const PageClass of PUBLIC_PAGE_CLASSES) {
    test(`${PageClass.url} - XHTML valid`, async ({ unauthenticatedRequest }) => {
      const response = await unauthenticatedRequest.get(PageClass.url, { headers: xhtmlHeaders });
      await expectValidXhtml(unauthenticatedRequest, await response.text());
    });
  }

  for (const PageClass of AUTHENTICATED_PAGE_CLASSES) {
    test(`${PageClass.url} - XHTML valid`, async ({ authenticatedRequest }) => {
      const response = await authenticatedRequest.get(PageClass.url, { headers: xhtmlHeaders });
      await expectValidXhtml(authenticatedRequest, await response.text());
    });
  }

  test('stylesheets - CSS valid', async ({ unauthenticatedRequest }) => {
    const response = await unauthenticatedRequest.get(HomePage.url, { headers: xhtmlHeaders });
    const text = await response.text();
    const baseUrl = new URL(response.url()).origin;
    const styleUrls = [...text.matchAll(/<\?xml-stylesheet\s+href="([^"]+)"/g)].map(
      (m) => new URL(m[1], baseUrl).href
    );
    expect(styleUrls.length, 'Expected at least one xml-stylesheet PI on the page').toBeGreaterThan(
      0
    );
    for (const url of styleUrls) {
      await expectValidCss(unauthenticatedRequest, url);
    }
  });
});
