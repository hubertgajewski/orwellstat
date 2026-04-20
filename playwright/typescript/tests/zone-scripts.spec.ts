import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { HitsPage } from '@pages/authenticated/hits.page';

// Committed HTML / HTML4 / XHTML fixture templates live under test-data/. Each embeds the
// tracking snippet the product renders at /zone/scripts/ for the populated account with a
// `{{ORWELLSTAT_BASE}}` placeholder in place of the server origin; the test substitutes
// the current baseURL at runtime so the same fixtures work against production and staging.
// If the product ever changes its snippet structure the templates must be regenerated —
// the structural test above fails first, giving a clear signal.
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

  // Assert each textarea contains the stable div id from its respective snippet template
  // so structural drift (a rename or a stripped snippet) fails fast instead of silently
  // slipping past a non-empty check. Uses toHaveText (reads textContent) because the page
  // is served as application/xhtml+xml: DOM nodeName is lowercase 'textarea', and
  // Playwright's toHaveValue checks nodeName === 'TEXTAREA' strictly and mis-reports
  // these as "Not an input element".
  await expect(scriptsPage.html5Snippet).toHaveText(/id="orwellstat"/);
  await expect(scriptsPage.html4Snippet).toHaveText(/id="orwellstat"/);
  await expect(scriptsPage.xhtmlSnippet).toHaveText(/id="osMainScript"/);
});

test.describe('scripts page tracking', { tag: '@regression' }, () => {
  for (const { label, filename } of TRACKING_FIXTURES) {
    test(`${label} snippet fires tracking and registers a hit`, async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const trackingUrlPrefix = `${baseURL}/scripts/`;

      // Materialise the fixture for this run: substitute the current environment's
      // origin into the template and write it to the test's own output dir so
      // document.location includes a unique per-run marker (see comment below).
      const template = readFileSync(new URL(filename, TEST_DATA_BASE), 'utf8');
      const materialisedPath = testInfo.outputPath(filename);
      writeFileSync(materialisedPath, template.replaceAll('{{ORWELLSTAT_BASE}}', baseURL));

      // Append a unique marker to the fixture URL so this assertion only matches the
      // hit this test just registered — /zone/hits/ keeps rows from every prior run
      // forever, and a plain filename substring would silently stay green during a
      // regression.
      const runMarker = randomUUID();
      const fixtureUrl = pathToFileURL(materialisedPath);
      fixtureUrl.searchParams.set('run', runMarker);

      await Promise.all([
        page.waitForRequest((req) => req.url().startsWith(trackingUrlPrefix), {
          timeout: 10_000,
        }),
        page.goto(fixtureUrl.href),
      ]);

      await page.goto(HitsPage.url);
      await expect(page.getByText(runMarker, { exact: false })).toBeVisible();
    });
  }
});
