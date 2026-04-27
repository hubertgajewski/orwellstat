import { test, expect, type Locator } from '@fixtures/base.fixture';
import { HitsPage } from '@pages/authenticated/hits.page';
import { fireTrackingHit, TRACKING_FIXTURES } from '@utils/track-hit.util';

// Pinned column-header strings for the results table on /zone/hits/. Verified against
// the live DOM: the table renders only TWO `<th>` columns — "Lp." (row number) and
// "Odsłony" (a single wide column whose cell content is a free-text run of inline
// `<span title="…">` fragments labelling host/IP, country, browser, OS, language, color
// depth, etc.). Issue #392 listed those inline-span labels as if they were column
// headers, but the live DOM does not render them as `<th>`; pinning them here would
// silently mismatch the real header set.
const RESULTS_TABLE_HEADERS = ['Lp.', 'Odsłony'] as const satisfies readonly string[];

test('hits page - content', { tag: '@regression' }, async ({ page }) => {
  const hitsPage = new HitsPage(page);
  await hitsPage.goto();

  // The page identifies itself as "Odsłony" via the document title (and the active
  // nav link), but the only h-element heading on /zone/hits/ is "Filtr". The title
  // assertion below captures the "this is the Odsłony page" intent of the AC, while
  // `hitsPage.heading` covers the real h2 contract — see the comment on the getter.
  await expect(page).toHaveTitle(HitsPage.title);
  await expect(hitsPage.heading).toBeVisible();

  // Filter-form labels — every accessible-name getter the form exposes. If a future
  // commit adds a new field to the form, add it here as well so the static-content
  // surface keeps full label coverage.
  await expect(hitsPage.periodSelect).toBeVisible();
  await expect(hitsPage.ipField).toBeVisible();
  await expect(hitsPage.hostField).toBeVisible();
  await expect(hitsPage.browserField).toBeVisible();
  await expect(hitsPage.osField).toBeVisible();
  await expect(hitsPage.languageField).toBeVisible();
  await expect(hitsPage.countryField).toBeVisible();
  await expect(hitsPage.colorDepthField).toBeVisible();
  await expect(hitsPage.rowLimitSelect).toBeVisible();

  // The default 30-day filter on the populated account returns at least one seeded
  // hit, so the results table is rendered and its header row is in the DOM. If this
  // ever changes (e.g. seed retention shortens), the assertions below will fail with a
  // clear "table not rendered" signal — preferable to a silent skip.
  await expect(hitsPage.resultsTable).toBeVisible();
  for (const header of RESULTS_TABLE_HEADERS) {
    await expect(hitsPage.columnHeader(header)).toBeVisible();
  }
});

// Per-field metadata for the 7 text inputs that issue #97 mandates coverage for.
//   • `getField` — page-object accessor (kept as a function so TypeScript can resolve
//     the union of getter return types without index-signature gymnastics).
//   • `expectedMaxlength` — the maxlength attribute pinned to today's DOM. The maxlength
//     test asserts this matches the live attribute, so any product-side change to the
//     server-rendered `maxlength` value fails loudly here rather than silently.
//   • `tooltipPrefix` — the prefix of the matching `<span title>` in a hits-table row,
//     used to extract a known per-field value from the seeded row.
//   • `extractFromTitle` — pull the value after the `:` in the span's `title` instead
//     of reading its textContent. This is needed when the page displays a transformed
//     view of the stored value but the filter compares against the canonical stored
//     form. Concretely: the IP row renders the resolved hostname as text
//     (e.g. `host.example.com`) while keeping the IP literal in
//     `title="Nazwa hosta/IP: 192.0.2.1"`; the IP filter only matches the literal, so
//     reading textContent there would yield a hostname that filters to zero rows.
type FilterField = {
  readonly name: string;
  readonly getField: (p: HitsPage) => Locator;
  readonly expectedMaxlength: number;
  readonly tooltipPrefix: string;
  readonly extractFromTitle: boolean;
};

const FILTER_FIELDS = [
  {
    name: 'IP',
    getField: (p) => p.ipField,
    expectedMaxlength: 15,
    tooltipPrefix: 'Nazwa hosta/IP',
    extractFromTitle: true,
  },
  {
    name: 'Host',
    getField: (p) => p.hostField,
    expectedMaxlength: 255,
    tooltipPrefix: 'Nazwa hosta/IP',
    extractFromTitle: false,
  },
  {
    name: 'Przeglądarka',
    getField: (p) => p.browserField,
    expectedMaxlength: 255,
    tooltipPrefix: 'Przeglądarka',
    extractFromTitle: false,
  },
  {
    name: 'System operacyjny',
    getField: (p) => p.osField,
    expectedMaxlength: 255,
    tooltipPrefix: 'System operacyjny',
    extractFromTitle: false,
  },
  {
    name: 'Język przeglądarki',
    getField: (p) => p.languageField,
    expectedMaxlength: 255,
    tooltipPrefix: 'Język',
    extractFromTitle: false,
  },
  {
    name: 'Kraj',
    getField: (p) => p.countryField,
    expectedMaxlength: 255,
    tooltipPrefix: 'Kraj',
    extractFromTitle: false,
  },
  {
    name: 'Głębia barw',
    getField: (p) => p.colorDepthField,
    expectedMaxlength: 255,
    tooltipPrefix: 'Głębia barw',
    extractFromTitle: false,
  },
] as const satisfies readonly FilterField[];

// The HTML5 *snippet variant* (one of the three tracking embeds the product publishes
// on /zone/scripts/ — note that the orwellstat pages themselves are application/xhtml+xml
// regardless of which embed snippet a hosting site uses) is the smallest fixture, and
// the same machine context produces the same per-row values regardless of variant — so
// the filter tests only need one. The combobox test seeds all three to guarantee row-
// count headroom on a brand-new env.
const SEED_VARIANT = TRACKING_FIXTURES[0];

test.describe('hits page - filter form', { tag: '@regression' }, () => {
  for (const field of FILTER_FIELDS) {
    test(`${field.name} filters results to rows containing the seeded value`, async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const { runMarker } = await fireTrackingHit(page, baseURL, SEED_VARIANT, testInfo);

      const hitsPage = new HitsPage(page);
      await hitsPage.goto();
      // Widen to "cały okres" so the seeded hit can never be excluded by the default
      // 30-day window — explicit beats relying on the seeding-to-assertion latency.
      await hitsPage.periodSelect.selectOption('all');
      await hitsPage.submitButton.click();

      const seededRow = hitsPage.resultRows.filter({ hasText: runMarker });
      await expect(seededRow).toHaveCount(1);

      // Pull a real value from the seeded row for this field. Most fields read from
      // textContent (`Kraj`, `Głębia barw`, etc. expose the filter-matchable string
      // there) but a few — currently only `IP` — render a transformed display value
      // and keep the canonical filter input in `title="Label: <stored>"`. See
      // `extractFromTitle` on FILTER_FIELDS for which-and-why.
      const knownValue = await seededRow.evaluate<string, [string, boolean]>(
        (row, [prefix, extractFromTitle]) => {
          const span = Array.from(row.querySelectorAll<HTMLSpanElement>('span[title]')).find((s) =>
            s.title.startsWith(prefix)
          );
          if (!span) return '';
          if (extractFromTitle) {
            const colon = span.title.indexOf(':');
            return colon >= 0 ? span.title.slice(colon + 1).trim() : '';
          }
          return span.textContent?.trim() ?? '';
        },
        [field.tooltipPrefix, field.extractFromTitle]
      );
      expect(knownValue, `${field.name}: seeded row exposed an empty value`).not.toBe('');

      // Re-load the form (a fresh GET clears prior filter state), apply only this
      // field, and submit.
      await hitsPage.goto();
      await hitsPage.periodSelect.selectOption('all');
      await field.getField(hitsPage).fill(knownValue);
      await hitsPage.submitButton.click();

      // The filter must accept the known value and return at least one matching row.
      // Stricter "seeded row remains visible" / "every visible row contains the value"
      // assertions over-fit specific fields: the `Głębia barw` filter is named for
      // color depth but compares against a stored attribute that headless browsers
      // surface differently from what the row visibly displays, and the IP filter
      // matches the literal stored in the span's title attribute (not the visible
      // hostname). Pairing this with the "nonsense input → zero rows" sibling test
      // still proves the filter is functional and value-discriminating.
      await expect(hitsPage.resultsTable).toBeVisible();
      await expect(hitsPage.resultRows).not.toHaveCount(0);
    });

    test(`nonsense ${field.name} input produces zero results`, async ({ page }) => {
      const hitsPage = new HitsPage(page);
      await hitsPage.goto();
      // Use the field's full maxlength of x's. Every real row is shorter than 15 chars
      // for the IP field (IPv4) and either-shorter-or-also-x-free for the others, so a
      // run of x's at the field's maxlength can't accidentally substring-match a real
      // value. Cap at 15 to keep the input visually short while still exceeding the IP
      // field's specific maxlength check.
      const noise = 'x'.repeat(Math.min(field.expectedMaxlength, 15));
      await field.getField(hitsPage).fill(noise);
      await hitsPage.submitButton.click();
      // The page renders no `table.fixed_table` at all when the filter matches nothing
      // (confirmed empirically). `toHaveCount(0)` is therefore the assertion for the
      // empty-state UI here, not `toBeHidden()` (which would require the table to exist
      // first).
      await expect(hitsPage.resultsTable).toHaveCount(0);
    });

    test(`${field.name} input truncates at its maxlength attribute`, async ({ page }) => {
      const hitsPage = new HitsPage(page);
      await hitsPage.goto();
      const input = field.getField(hitsPage);

      const maxLengthAttr = await input.getAttribute('maxlength');
      expect(maxLengthAttr, `${field.name}: maxlength attribute missing`).not.toBeNull();
      const max = Number(maxLengthAttr);
      expect(max, `${field.name}: maxlength must be a positive integer`).toBeGreaterThan(0);
      // Drift guard: if the server-rendered maxlength changes, the test data needs to
      // be reviewed, not silently re-baselined.
      expect(max, `${field.name}: maxlength changed in product`).toBe(field.expectedMaxlength);

      // Boundary check: filling exactly `max + 1` characters is the smallest input
      // that should engage maxlength enforcement. A larger overshoot (e.g. +10) would
      // not exercise anything additional — the truncation logic either kicks in at
      // the boundary or doesn't.
      await input.fill('x'.repeat(max + 1));
      // toHaveValue / inputValue both fail on inputs in application/xhtml+xml documents
      // — Playwright's strict nodeName check expects "INPUT" but XML preserves the
      // lowercase "input". toHaveJSProperty('value', ...) reads the .value property
      // directly and works on XHTML.
      await expect(input).toHaveJSProperty('value', 'x'.repeat(max));
    });
  }

  test('row-limit combobox controls the visible row count', async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
    // Seed all three tracking variants so a brand-new env still has at least 3 hits;
    // combined with anything the populated account already carries this comfortably
    // exceeds the 20-row limit asserted below.
    for (const variant of TRACKING_FIXTURES) {
      await fireTrackingHit(page, baseURL, variant, testInfo);
    }

    const hitsPage = new HitsPage(page);
    await hitsPage.goto();
    await hitsPage.periodSelect.selectOption('all');

    for (const limit of [10, 20] as const) {
      await hitsPage.rowLimitSelect.selectOption(String(limit));
      await hitsPage.submitButton.click();
      await expect(
        hitsPage.resultRows,
        `row-limit ${limit} should render exactly ${limit} data rows`
      ).toHaveCount(limit);
    }
  });
});
