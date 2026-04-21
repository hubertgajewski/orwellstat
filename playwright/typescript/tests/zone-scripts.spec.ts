import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { HitsPage } from '@pages/authenticated/hits.page';

// Single source of truth for each snippet body. The structural test below asserts these
// match what /zone/scripts/ renders into each textarea, and the tracking tests embed them
// into a thin HTML/HTML4/XHTML shell so the code that fires tracking is literally the code
// the product distributes. Each snippet uses `{{ORWELLSTAT_BASE}}` in place of the server
// origin and `{{ORWELLSTAT_USER}}` in place of the tracking account id; both are
// substituted at runtime so the same files work against production and staging and
// against whatever populated-account credentials the environment provides. Read sync
// once at module load — this happens at worker startup, not on a hot path.
const TEST_DATA_BASE = new URL('../test-data/scripts/', import.meta.url);
const CANONICAL_SNIPPETS = {
  'tracking-html5.html': readFileSync(new URL('snippet-html5.txt', TEST_DATA_BASE), 'utf8'),
  'tracking-html4.html': readFileSync(new URL('snippet-html4.txt', TEST_DATA_BASE), 'utf8'),
  'tracking.xhtml': readFileSync(new URL('snippet-xhtml.txt', TEST_DATA_BASE), 'utf8'),
} as const;

function applySubstitutions(template: string, baseURL: string): string {
  const user = process.env.ORWELLSTAT_USER;
  if (!user) throw new Error('ORWELLSTAT_USER must be set in .env (local) or repo secrets (CI)');
  return template
    .replaceAll('{{ORWELLSTAT_BASE}}', baseURL)
    .replaceAll('{{ORWELLSTAT_USER}}', user);
}

const TRACKING_FIXTURES = [
  { label: 'HTML5', filename: 'tracking-html5.html' },
  { label: 'HTML4/XHTML', filename: 'tracking-html4.html' },
  { label: 'application/xhtml+xml', filename: 'tracking.xhtml' },
] as const;

test('scripts page - content', { tag: '@regression' }, async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
  await page.goto(ScriptsPage.url);
  const scriptsPage = new ScriptsPage(page);

  await expect(scriptsPage.heading).toBeVisible();
  await expect(scriptsPage.html5SectionHeading).toBeVisible();
  await expect(scriptsPage.html4SectionHeading).toBeVisible();
  await expect(scriptsPage.xhtmlSectionHeading).toBeVisible();

  // Assert the full snippet text, not just a marker: any product-side drift (renamed id,
  // changed URL, stripped noscript fallback, tweaked comment) breaks the test immediately.
  // toHaveText reads textContent — the correct way to read a textarea's default value on
  // an application/xhtml+xml page (toHaveValue checks nodeName === 'TEXTAREA' strictly and
  // fails on the lowercase nodeName that XML parsing preserves).
  await expect(scriptsPage.html5Snippet).toHaveText(
    applySubstitutions(CANONICAL_SNIPPETS['tracking-html5.html'], baseURL)
  );
  await expect(scriptsPage.html4Snippet).toHaveText(
    applySubstitutions(CANONICAL_SNIPPETS['tracking-html4.html'], baseURL)
  );
  await expect(scriptsPage.xhtmlSnippet).toHaveText(
    applySubstitutions(CANONICAL_SNIPPETS['tracking.xhtml'], baseURL)
  );
});

test.describe('scripts page tracking', { tag: '@regression' }, () => {
  for (const { label, filename } of TRACKING_FIXTURES) {
    test(`${label} snippet fires tracking and registers a hit`, async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const trackingUrlPrefix = `${baseURL}/scripts/`;

      // Materialise the fixture for this run: read the committed shell, substitute the
      // single-source snippet body and the current environment's origin, then write the
      // result to the test's own output dir so document.location includes a unique per-run
      // marker (see comment below).
      const shell = await readFile(new URL(filename, TEST_DATA_BASE), 'utf8');
      const snippet = CANONICAL_SNIPPETS[filename];
      const materialised = applySubstitutions(shell.replace('{{SNIPPET}}', snippet), baseURL);
      const materialisedPath = testInfo.outputPath(filename);
      await writeFile(materialisedPath, materialised);

      // Append a unique marker to the fixture URL so this assertion only matches the hit
      // this test just registered — /zone/hits/ keeps rows from every prior run forever,
      // and a plain filename substring would silently stay green during a regression.
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
      // exact: false is correct here — the hits-table cell contains the full URL, host
      // info, browser, and other metadata; the UUID is a substring within that text, not
      // the cell's entire content.
      await expect(page.getByText(runMarker, { exact: false })).toBeVisible();
    });
  }
});
