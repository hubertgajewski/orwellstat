import { randomUUID } from 'node:crypto';
import { test, expect } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { HitsPage } from '@pages/authenticated/hits.page';

const TRACKING_URL_PATTERN = 'orwellstat.hubertgajewski.com/scripts/';

// Static HTML/HTML4/XHTML fixtures live next to the test files under test-data/ so they
// are committed and deterministic. Each embeds the same tracking snippet the product
// renders at /zone/scripts/ for the populated account; if that snippet changes the
// fixtures must be regenerated (the structural test above fails first, giving a signal).
const TEST_DATA_BASE = new URL('../test-data/scripts/', import.meta.url);

const TRACKING_FIXTURES = [
  { label: 'HTML5', filename: 'tracking-html5.html' },
  { label: 'HTML4/XHTML', filename: 'tracking-html4.html' },
  { label: 'application/xhtml+xml', filename: 'tracking.xhtml' },
] as const;

test('scripts page - content', { tag: '@regression' }, async ({ page }) => {
  await page.goto(ScriptsPage.url);
  const scriptsPage = new ScriptsPage(page);

  await expect(scriptsPage.heading).toBeVisible();
  await expect(scriptsPage.html5SectionHeading).toBeVisible();
  await expect(scriptsPage.html4SectionHeading).toBeVisible();
  await expect(scriptsPage.xhtmlSectionHeading).toBeVisible();

  // The page is served as application/xhtml+xml, so DOM nodeName is lowercase
  // ('textarea'). Playwright's toHaveValue checks nodeName === 'TEXTAREA' strictly and
  // mis-reports these as "Not an input element"; assert the server-rendered default
  // value via textContent instead (equivalent for a fresh page).
  await expect(scriptsPage.html5Snippet).toHaveText(/\S/);
  await expect(scriptsPage.html4Snippet).toHaveText(/\S/);
  await expect(scriptsPage.xhtmlSnippet).toHaveText(/\S/);
});

test.describe('scripts page tracking', { tag: '@regression' }, () => {
  for (const { label, filename } of TRACKING_FIXTURES) {
    test(`${label} snippet fires tracking and registers a hit`, async ({ page }) => {
      // Append a unique marker to the fixture URL so this assertion only matches the hit
      // this test just registered — /zone/hits/ keeps rows from every prior run forever,
      // and a plain filename substring would silently stay green during a regression.
      const runMarker = randomUUID();
      const fixtureUrl = new URL(filename, TEST_DATA_BASE);
      fixtureUrl.searchParams.set('run', runMarker);

      await Promise.all([
        page.waitForRequest((req) => req.url().includes(TRACKING_URL_PATTERN), {
          timeout: 10_000,
        }),
        page.goto(fixtureUrl.href),
      ]);

      await page.goto(HitsPage.url);
      await expect(page.getByText(runMarker, { exact: false })).toBeVisible();
    });
  }
});
