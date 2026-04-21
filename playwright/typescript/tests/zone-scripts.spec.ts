import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { HitsPage } from '@pages/authenticated/hits.page';

// Canonical snippet pattern per variant. The placeholders cover the two values that vary
// by environment: `{{ORWELLSTAT_BASE}}` is the server origin (substituted with the live
// Playwright baseURL at assertion time) and `{{ORWELLSTAT_USER}}` is the tracking account
// id (matched as a wildcard at assertion time because it is rendered by the server and
// does not correspond to any credential the test harness holds — it differs per env).
// Read sync once at module load — this happens at worker startup, not on a hot path.
const TEST_DATA_BASE = new URL('../test-data/scripts/', import.meta.url);
const CANONICAL_SNIPPETS = {
  'tracking-html5.html': readFileSync(new URL('snippet-html5.txt', TEST_DATA_BASE), 'utf8'),
  'tracking-html4.html': readFileSync(new URL('snippet-html4.txt', TEST_DATA_BASE), 'utf8'),
  'tracking.xhtml': readFileSync(new URL('snippet-xhtml.txt', TEST_DATA_BASE), 'utf8'),
} as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build an anchored regex from a canonical template: substitute `{{ORWELLSTAT_BASE}}`
// with the real baseURL, regex-escape the literal parts, and turn `{{ORWELLSTAT_USER}}`
// into a wildcard that matches any non-empty tracking-id token. This keeps every byte of
// the snippet pinned (any product-side drift fails) except for the account id, which
// varies by environment.
function canonicalRegex(template: string, baseURL: string): RegExp {
  const withBase = template.replaceAll('{{ORWELLSTAT_BASE}}', baseURL);
  const parts = withBase.split('{{ORWELLSTAT_USER}}').map(escapeRegex);
  return new RegExp(`^${parts.join('[^&"<]+')}$`);
}

const TRACKING_FIXTURES = [
  { label: 'HTML5', filename: 'tracking-html5.html', snippetGetter: 'html5Snippet' },
  { label: 'HTML4/XHTML', filename: 'tracking-html4.html', snippetGetter: 'html4Snippet' },
  { label: 'application/xhtml+xml', filename: 'tracking.xhtml', snippetGetter: 'xhtmlSnippet' },
] as const;

test('scripts page - content', { tag: '@regression' }, async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
  await page.goto(ScriptsPage.url);
  const scriptsPage = new ScriptsPage(page);

  await expect(scriptsPage.heading).toBeVisible();
  await expect(scriptsPage.html5SectionHeading).toBeVisible();
  await expect(scriptsPage.html4SectionHeading).toBeVisible();
  await expect(scriptsPage.xhtmlSectionHeading).toBeVisible();

  // Assert each textarea's full body matches the canonical regex (id wildcarded). Any
  // product-side drift (renamed id, changed URL, stripped noscript fallback, tweaked
  // comment) fails the regex. toHaveText reads textContent — the correct way to read a
  // textarea's default value on an application/xhtml+xml page (toHaveValue checks
  // nodeName === 'TEXTAREA' strictly and fails on the lowercase nodeName XML preserves).
  await expect(scriptsPage.html5Snippet).toHaveText(
    canonicalRegex(CANONICAL_SNIPPETS['tracking-html5.html'], baseURL)
  );
  await expect(scriptsPage.html4Snippet).toHaveText(
    canonicalRegex(CANONICAL_SNIPPETS['tracking-html4.html'], baseURL)
  );
  await expect(scriptsPage.xhtmlSnippet).toHaveText(
    canonicalRegex(CANONICAL_SNIPPETS['tracking.xhtml'], baseURL)
  );
});

test.describe('scripts page tracking', { tag: '@regression' }, () => {
  for (const { label, filename, snippetGetter } of TRACKING_FIXTURES) {
    test(`${label} snippet fires tracking and registers a hit`, async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const trackingUrlPrefix = `${baseURL}/scripts/`;

      // Pull the live snippet from /zone/scripts/ so the tracking fixture uses the exact
      // code the product distributes for the current environment, with the correct
      // account id. This is the same textarea whose body the structural test above
      // verifies against the canonical regex.
      await page.goto(ScriptsPage.url);
      const scriptsPage = new ScriptsPage(page);
      const liveSnippet = (await scriptsPage[snippetGetter].textContent()) ?? '';
      if (!liveSnippet.trim()) throw new Error(`${label} snippet textarea was empty`);

      // Materialise the fixture: read the committed shell, inject the live snippet, and
      // write the result to the test's own output dir so document.location includes a
      // unique per-run marker (see comment below).
      const shell = await readFile(new URL(filename, TEST_DATA_BASE), 'utf8');
      const materialisedPath = testInfo.outputPath(filename);
      await writeFile(materialisedPath, shell.replace('{{SNIPPET}}', liveSnippet));

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
