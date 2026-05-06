import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { type Page, type TestInfo } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { loadEnv } from '@utils/env.util';

loadEnv(import.meta.url, 3);

// Re-exported so spec files reading sibling fixtures (e.g. the canonical-snippet
// templates in zone-scripts.spec.ts) point at the same directory the helper does — a
// single source of truth means a future move of `test-data/scripts/` updates here and
// flows everywhere automatically.
export const TEST_DATA_BASE = new URL('../test-data/scripts/', import.meta.url);

// The three tracking-snippet variants the product publishes on /zone/scripts/. The
// `snippetGetter` is the corresponding getter on `ScriptsPage` whose textarea body the
// helper reads to obtain the live (env-correct) snippet to paste into a fixture page.
export const TRACKING_FIXTURES = [
  { label: 'HTML5', filename: 'tracking-html5.html', snippetGetter: 'html5Snippet' },
  { label: 'HTML4/XHTML', filename: 'tracking-html4.html', snippetGetter: 'html4Snippet' },
  { label: 'application/xhtml+xml', filename: 'tracking.xhtml', snippetGetter: 'xhtmlSnippet' },
] as const;

export type TrackingFixture = (typeof TRACKING_FIXTURES)[number];

// Materialises a local fixture page from the live /zone/scripts/ snippet, opens it in
// the browser to fire one tracking request to /scripts/, and returns the unique run
// marker baked into the fixture URL so callers can locate the resulting hit row in
// /zone/hits/. Sharing this seeding primitive across spec files lets the
// /zone/scripts/ tests assert on the snippet's structural correctness while the
// /zone/hits/ tests reuse the same primitive to seed identifiable filter-target rows
// without duplicating the tracking flow.
export async function fireTrackingHit(
  page: Page,
  baseURL: string,
  variant: TrackingFixture,
  testInfo: TestInfo
): Promise<{ runMarker: string }> {
  const trackingUrlPrefix = `${baseURL}/scripts/`;

  // Pull the live snippet from /zone/scripts/ so the fixture uses the exact code the
  // product distributes in this environment, with the correct account id.
  await page.goto(ScriptsPage.url);
  const scriptsPage = new ScriptsPage(page);
  const liveSnippet = (await scriptsPage[variant.snippetGetter].textContent()) ?? '';
  if (!liveSnippet.trim()) throw new Error(`${variant.label} snippet textarea was empty`);

  // Read the committed shell, inject the live snippet, and write the result to the
  // test's own output dir so document.location includes a unique per-run marker.
  const shell = await readFile(new URL(variant.filename, TEST_DATA_BASE), 'utf8');
  const materialisedPath = testInfo.outputPath(variant.filename);
  await writeFile(materialisedPath, shell.replace('{{SNIPPET}}', liveSnippet));

  // Append a unique marker to the fixture URL so callers can locate this exact hit row
  // in /zone/hits/ — the page keeps every hit forever and a plain filename substring
  // would silently match older runs.
  const runMarker = randomUUID();
  const fixtureUrl = pathToFileURL(materialisedPath);
  fixtureUrl.searchParams.set('run', runMarker);

  await Promise.all([
    page.waitForRequest((req) => req.url().startsWith(trackingUrlPrefix), { timeout: 10_000 }),
    page.goto(fixtureUrl.href),
  ]);

  // Hits are now written to a log file and drained by cron. POST to the drain
  // endpoint with the shared-secret token so the cron is forced to flush the
  // log into the DB before the caller asserts on /zone/hits/. The custom
  // header is the primary CSRF defence on the server side; tests carry the
  // matching token via ORWELLSTAT_DRAIN_TOKEN (CI secret / .env locally).
  const drainToken = process.env.ORWELLSTAT_DRAIN_TOKEN;
  if (!drainToken) {
    throw new Error(
      'ORWELLSTAT_DRAIN_TOKEN missing — set it in .env (local) or repo secrets (CI).'
    );
  }
  // Retry on 429: parallel workers share an egress IP and may collide on the
  // server-side per-IP cooldown window. Jitter prevents thundering-herd on retry.
  const drainHeaders = { 'X-Orwellstat-Test-Token': drainToken };
  let drainResponse = await page.request.post(`${baseURL}/scripts/drain.php`, {
    headers: drainHeaders,
  });
  for (let attempt = 0; drainResponse.status() === 429 && attempt < 10; attempt++) {
    const retryAfter = parseInt(drainResponse.headers()['retry-after'] ?? '5', 10) * 1000;
    await page.waitForTimeout(retryAfter + Math.floor(Math.random() * 3000));
    drainResponse = await page.request.post(`${baseURL}/scripts/drain.php`, {
      headers: drainHeaders,
    });
  }
  if (!drainResponse.ok()) {
    throw new Error(`drain.php returned ${drainResponse.status()} — hit may not be in DB yet.`);
  }

  return { runMarker };
}
