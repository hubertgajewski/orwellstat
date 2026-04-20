import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@fixtures/base.fixture';
import { ScriptsPage } from '@pages/authenticated/scripts.page';
import { HitsPage } from '@pages/authenticated/hits.page';

// Canonical snippet content the product renders inside each textarea on /zone/scripts/ for
// the populated account. `{{ORWELLSTAT_BASE}}` is substituted with the active Playwright
// baseURL at assertion time so the same strings work against both production and staging.
// If the product changes any of these snippets, the structural test below fails and the
// maintainer must refresh both the canonical string here and the matching fixture template.
const CANONICAL_HTML5_SNIPPET = `<!-- Orwell Stat (C) 2003-2020 Hubert Gajewski ver. 0.9 HTML -->
<div id="orwellstat">
<script src="{{ORWELLSTAT_BASE}}/scripts/?id=populated">
</script>
<img src="{{ORWELLSTAT_BASE}}/scripts/sms.php?id=populated" width="0" height="0" alt="" />
<noscript>
<div><img src="{{ORWELLSTAT_BASE}}/scripts/noscript.php?id=populated" width="0" height="0" alt="" /></div>
</noscript>
</div>`;

const CANONICAL_HTML4_SNIPPET = `<!-- Orwell Stat (C) 2003-2017 Hubert Gajewski ver. 0.5 HTML -->
<div id="orwellstat">
<script type="text/javascript" src="{{ORWELLSTAT_BASE}}/scripts/?id=populated">
</script>
<img src="{{ORWELLSTAT_BASE}}/scripts/sms.php?id=populated" width="0" height="0" alt="" />
<noscript>
<div><img src="{{ORWELLSTAT_BASE}}/scripts/noscript.php?id=populated" width="0" height="0" alt="" /></div>
</noscript>
</div>`;

const CANONICAL_XHTML_SNIPPET = `<!-- Orwell Stat (C) 2003-2017 Hubert Gajewski ver. 0.8 XHTML -->
<div id="osMainScript">
<script type="text/javascript">
if(document.createElementNS)
{var osScriptSource = "{{ORWELLSTAT_BASE}}/scripts/06.php?id=populated&amp;w="+
window.screen.height+"&amp;s="+window.screen.width+"&amp;g="+
window.screen.colorDepth+"&amp;k="+Math.pow(2,window.screen.colorDepth)+"&amp;o="+
escape(document.referrer)+"&amp;l="+escape(document.location);
var osCreateElement = document.createElementNS("http://www.w3.org/1999/xhtml","script");
osCreateElement.setAttribute("type", "text/javascript");
osCreateElement.setAttribute("src", osScriptSource);
document.getElementsByTagName("div").osMainScript.appendChild(osCreateElement);}
</script>
</div>`;

function withBase(template: string, baseURL: string): string {
  return template.replaceAll('{{ORWELLSTAT_BASE}}', baseURL);
}

// Committed HTML / HTML4 / XHTML fixture templates live under test-data/. Each embeds the
// same tracking snippet (with the same `{{ORWELLSTAT_BASE}}` placeholder) so the tracking
// tests exercise the exact code users would copy-paste. If a snippet changes, update both
// the canonical constant above and the corresponding tracking fixture template.
const TEST_DATA_BASE = new URL('../test-data/scripts/', import.meta.url);

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
  await expect(scriptsPage.html5Snippet).toHaveText(withBase(CANONICAL_HTML5_SNIPPET, baseURL));
  await expect(scriptsPage.html4Snippet).toHaveText(withBase(CANONICAL_HTML4_SNIPPET, baseURL));
  await expect(scriptsPage.xhtmlSnippet).toHaveText(withBase(CANONICAL_XHTML_SNIPPET, baseURL));
});

test.describe('scripts page tracking', { tag: '@regression' }, () => {
  for (const { label, filename } of TRACKING_FIXTURES) {
    test(`${label} snippet fires tracking and registers a hit`, async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const trackingUrlPrefix = `${baseURL}/scripts/`;

      // Materialise the fixture for this run: substitute the current environment's origin
      // into the template and write it to the test's own output dir so document.location
      // includes a unique per-run marker (see comment below).
      const template = readFileSync(new URL(filename, TEST_DATA_BASE), 'utf8');
      const materialisedPath = testInfo.outputPath(filename);
      writeFileSync(materialisedPath, withBase(template, baseURL));

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
      await expect(page.getByText(runMarker, { exact: false })).toBeVisible();
    });
  }
});
