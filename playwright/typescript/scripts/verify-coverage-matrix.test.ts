import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  verify,
  parseSpec,
  expandTemplates,
  computeCovered,
  type ActiveTest,
  type CoverageMatrix,
} from './verify-coverage-matrix.ts';

// All URLs the verifier knows about. Tests build a full-shape matrix so the drift guard
// in `verify()` (URL set in matrix === URL set known to the verifier) doesn't fire as a
// side effect on every assertion.
const ALL_URLS = [
  '/',
  '/about/',
  '/statistics/',
  '/contact/',
  '/register/',
  '/password_reset/',
  '/2/',
  '/zone/',
  '/zone/stats/',
  '/zone/hits/',
  '/zone/scripts/',
  '/zone/admin/',
  '/scripts/*.php',
] as const;

// Build a fully-shaped coverage matrix with every URL × category cell set to a default.
// `pageOverrides` and `formOverrides` flip individual cells without spelling out the
// rest. Mirrors the in-repo matrix shape so tests stay close to production reality.
function makeMatrix(
  pageDefault = false,
  formDefault = false,
  pageOverrides: Partial<
    Record<(typeof ALL_URLS)[number], Partial<CoverageMatrix['pages'][string]>>
  > = {},
  formOverrides: Partial<CoverageMatrix['forms']> = {}
): CoverageMatrix {
  const pages: CoverageMatrix['pages'] = {};
  for (const url of ALL_URLS) {
    pages[url] = {
      title: pageDefault,
      content: pageDefault,
      accessibility: pageDefault,
      visualRegression: pageDefault,
      api: pageDefault,
      securityHeaders: pageDefault,
      negativePath: pageDefault,
      tracking: pageDefault,
      ...(pageOverrides[url] ?? {}),
    };
  }
  return {
    pages,
    forms: {
      login: formDefault,
      hitsFilter: formDefault,
      adminSettings: formDefault,
      statisticsParameter: formDefault,
      styleSelector: formDefault,
      ...formOverrides,
    },
  };
}

// Synthetic active-test inventory matching the in-repo spec shape: accessibility +
// navigation iterate every URL via `${PageClass.url}` patterns; api.spec.ts has the
// three aggregate tests; visual + content have per-URL named tests.
function makeAllCoveredTests(): ActiveTest[] {
  return expandTemplates([
    { file: 'accessibility.spec.ts', title: '${PageClass.url}', describe: null },
    { file: 'navigation.spec.ts', title: '${PageClass.url} has correct title', describe: null },
    { file: 'api.spec.ts', title: 'public pages without authentication', describe: null },
    { file: 'api.spec.ts', title: 'public pages with authentication', describe: null },
    { file: 'api.spec.ts', title: 'authenticated pages', describe: null },
    { file: 'visual.spec.ts', title: 'home page visual regression', describe: null },
    { file: 'visual.spec.ts', title: 'about system page visual regression', describe: null },
    { file: 'visual.spec.ts', title: 'contact page visual regression', describe: null },
    { file: 'visual.spec.ts', title: 'statistics page visual regression', describe: null },
    // Raw template form mirrors what `parseSpec` actually emits for the in-repo
    // `\`${page} visual regression - ${style} style\`` loop in visual.spec.ts —
    // `expandTemplates` only resolves `${X.url}`, so `${style}` survives verbatim.
    {
      file: 'visual.spec.ts',
      title: 'home page visual regression - ${style} style',
      describe: null,
    },
    { file: 'home.spec.ts', title: 'home page', describe: null },
    {
      file: 'about-system.spec.ts',
      title: 'about system page - headings and statsbar content',
      describe: null,
    },
    {
      file: 'contact.spec.ts',
      title: 'contact page - headings and statsbar content',
      describe: null,
    },
    { file: 'statistics.spec.ts', title: 'system statistics', describe: null },
    { file: 'register.spec.ts', title: 'register page - content', describe: null },
    {
      file: 'zone-information.spec.ts',
      title: 'visit-frequency and ranking sections with data',
      describe: null,
    },
    {
      file: 'zone-information.spec.ts',
      title: 'shows "no hits in last 30 days" empty-state message',
      describe: null,
    },
    { file: 'zone-scripts.spec.ts', title: 'scripts page - content', describe: null },
    {
      file: 'zone-scripts.spec.ts',
      title: '${variant.label} snippet fires tracking and registers a hit',
      describe: null,
    },
    { file: 'password-reset.spec.ts', title: 'password reset page - content', describe: null },
    { file: 'zone-hits.spec.ts', title: 'hits page - content', describe: null },
    {
      file: 'zone-hits.spec.ts',
      title: 'nonsense IP input produces zero results',
      describe: null,
    },
    // The "hits page - filter form" describe block in zone-hits.spec.ts is what the
    // hitsFilter rule keys off (parseSpec emits each describe call as its own top-level
    // entry with describe: null because it doesn't track nesting).
    { file: 'zone-hits.spec.ts', title: 'hits page - filter form', describe: null },
    // adminSettings rule keys off the primary "admin page - settings form" describe in
    // zone-admin.spec.ts; same parser convention as hitsFilter.
    { file: 'zone-admin.spec.ts', title: 'admin page - settings form', describe: null },
    {
      file: 'zone-admin.spec.ts',
      title: 'wrong current password shows the "incorrect password" error',
      describe: null,
    },
  ]);
}

// Matrix that matches what makeAllCoveredTests() actually covers. /2/ is partially
// covered (title + content via home.spec.ts only); /register/ adds content via
// register.spec.ts; /password_reset/ adds content via password-reset.spec.ts; the
// authenticated tail gets title + accessibility + api but no content/visual.
function makeInSyncMatrix(): CoverageMatrix {
  return makeMatrix(
    false,
    false,
    {
      '/': { title: true, content: true, accessibility: true, visualRegression: true, api: true },
      '/about/': {
        title: true,
        content: true,
        accessibility: true,
        visualRegression: true,
        api: true,
      },
      '/statistics/': {
        title: true,
        content: true,
        accessibility: true,
        visualRegression: true,
        api: true,
      },
      '/contact/': {
        title: true,
        content: true,
        accessibility: true,
        visualRegression: true,
        api: true,
      },
      '/register/': { title: true, content: true, accessibility: true, api: true },
      '/password_reset/': { title: true, content: true, accessibility: true, api: true },
      '/2/': { title: true, content: true },
      '/zone/': { title: true, content: true, accessibility: true, api: true, negativePath: true },
      '/zone/stats/': { title: true, accessibility: true, api: true },
      '/zone/hits/': {
        title: true,
        content: true,
        accessibility: true,
        api: true,
        negativePath: true,
      },
      '/zone/scripts/': { title: true, content: true, accessibility: true, api: true },
      '/zone/admin/': { title: true, accessibility: true, api: true, negativePath: true },
      '/scripts/*.php': { tracking: true },
    },
    {
      statisticsParameter: true,
      styleSelector: true,
      hitsFilter: true,
      adminSettings: true,
    }
  );
}

// === verify(): the four DoD scenarios ====================================================

test('verify: in-sync matrix passes with no errors', () => {
  const result = verify(makeInSyncMatrix(), makeAllCoveredTests());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('verify: false-positive — matrix claims coverage that no test provides', () => {
  const matrix = makeInSyncMatrix();
  matrix.pages['/zone/stats/'].visualRegression = true;
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /false-positive.*\/zone\/stats\/.*visualRegression/);
});

test('verify: false-negative — an active test covers a cell the matrix has as false', () => {
  const matrix = makeInSyncMatrix();
  matrix.pages['/'].visualRegression = false;
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /false-negative.*\/.*visualRegression/);
});

test('verify: matrix-edit regression — flipping a covered cell to false is caught', () => {
  const matrix = makeInSyncMatrix();
  matrix.pages['/'].accessibility = false;
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /false-negative.*\/.*accessibility/);
});

// === verify(): URL drift guard ============================================================

test('verify: drift guard flags an unknown URL added to the matrix', () => {
  const matrix = makeInSyncMatrix();
  matrix.pages['/new-page/'] = {
    title: false,
    content: false,
    accessibility: false,
    visualRegression: false,
    api: false,
    securityHeaders: false,
    negativePath: false,
    tracking: false,
  };
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /unknown URL in matrix: "\/new-page\/"/.test(e)));
});

test('verify: drift guard flags a known URL removed from the matrix', () => {
  const matrix = makeInSyncMatrix();
  delete matrix.pages['/zone/admin/'];
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) =>
      /URL "\/zone\/admin\/" is in the verifier's URL groups but missing/.test(e)
    )
  );
});

// === verify(): forms ======================================================================

test('verify: forms — false-positive on form coverage is flagged', () => {
  const matrix = makeInSyncMatrix();
  matrix.forms.login = true; // login is only test.fixme — no active test covers it
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /false-positive.*forms\["login"\]/.test(e)));
});

test('verify: forms — false-negative on form coverage is flagged', () => {
  const matrix = makeInSyncMatrix();
  matrix.forms.statisticsParameter = false; // active test exists in fixture
  const result = verify(matrix, makeAllCoveredTests());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /false-negative.*forms\["statisticsParameter"\]/.test(e)));
});

// === computeCovered(): per-rule coverage ==================================================

test('computeCovered: accessibility iterates expanded ${PageClass.url} titles', () => {
  const tests = expandTemplates([
    { file: 'accessibility.spec.ts', title: '${PageClass.url}', describe: null },
  ]);
  const covered = computeCovered(tests);
  assert.ok(covered.has('/|accessibility'));
  assert.ok(covered.has('/zone/admin/|accessibility'));
  // /2/ is intentionally NOT iterated by accessibility.spec.ts — verify rule mirrors that.
  assert.ok(!covered.has('/2/|accessibility'));
});

test('computeCovered: api requires both public-pages tests for public URLs', () => {
  // Only one of the two public api tests present → public api NOT covered.
  const onlyOne = computeCovered([
    {
      file: 'api.spec.ts',
      title: 'public pages with authentication',
      describe: null,
    },
  ]);
  assert.ok(!onlyOne.has('/|api'));

  // Both present → public api covered.
  const both = computeCovered([
    { file: 'api.spec.ts', title: 'public pages without authentication', describe: null },
    { file: 'api.spec.ts', title: 'public pages with authentication', describe: null },
  ]);
  assert.ok(both.has('/|api'));
  assert.ok(both.has('/about/|api'));
  // Authenticated URLs require the third aggregate.
  assert.ok(!both.has('/zone/|api'));
});

test('computeCovered: api authenticated-pages test covers all authenticated URLs', () => {
  const covered = computeCovered([
    { file: 'api.spec.ts', title: 'authenticated pages', describe: null },
  ]);
  assert.ok(covered.has('/zone/|api'));
  assert.ok(covered.has('/zone/admin/|api'));
  assert.ok(!covered.has('/|api'));
});

test('computeCovered: navigation title iteration plus /2/ via home.spec.ts', () => {
  const covered = computeCovered(
    expandTemplates([
      { file: 'navigation.spec.ts', title: '${PageClass.url} has correct title', describe: null },
      { file: 'home.spec.ts', title: 'home page', describe: null },
    ])
  );
  assert.ok(covered.has('/|title'));
  assert.ok(covered.has('/zone/admin/|title'));
  // /2/ title comes from home.spec.ts (toHaveTitle on PreviouslyAddedPage), not navigation.
  assert.ok(covered.has('/2/|title'));
});

test('computeCovered: visualRegression rules — each named test maps to its URL', () => {
  const covered = computeCovered([
    { file: 'visual.spec.ts', title: 'home page visual regression', describe: null },
    { file: 'visual.spec.ts', title: 'contact page visual regression', describe: null },
  ]);
  assert.ok(covered.has('/|visualRegression'));
  assert.ok(covered.has('/contact/|visualRegression'));
  assert.ok(!covered.has('/about/|visualRegression'));
  assert.ok(!covered.has('/statistics/|visualRegression'));
});

test('computeCovered: content rules — primary spec per URL', () => {
  const covered = computeCovered([
    { file: 'home.spec.ts', title: 'home page', describe: null },
    { file: 'zone-scripts.spec.ts', title: 'scripts page - content', describe: null },
  ]);
  // home.spec.ts covers content for both '/' and '/2/' (it navigates to PreviouslyAddedPage).
  assert.ok(covered.has('/|content'));
  assert.ok(covered.has('/2/|content'));
  assert.ok(covered.has('/zone/scripts/|content'));
  assert.ok(!covered.has('/about/|content'));
});

test('computeCovered: negativePath rules map empty/error/zero-result tests to the right pages', () => {
  const covered = computeCovered([
    {
      file: 'zone-information.spec.ts',
      title: 'shows "no hits in last 30 days" empty-state message',
      describe: null,
    },
    {
      file: 'zone-hits.spec.ts',
      title: 'nonsense IP input produces zero results',
      describe: null,
    },
    {
      file: 'zone-admin.spec.ts',
      title: 'wrong current password shows the "incorrect password" error',
      describe: null,
    },
  ]);
  assert.ok(covered.has('/zone/|negativePath'));
  assert.ok(covered.has('/zone/hits/|negativePath'));
  assert.ok(covered.has('/zone/admin/|negativePath'));
  assert.ok(!covered.has('/zone/stats/|negativePath'));
});

test('computeCovered: tracking rule maps tracker-contract tests to /scripts/*.php', () => {
  const covered = computeCovered([
    {
      file: 'zone-scripts.spec.ts',
      title: '${variant.label} snippet fires tracking and registers a hit',
      describe: null,
    },
  ]);
  assert.ok(covered.has('/scripts/*.php|tracking'));
  assert.ok(!covered.has('/zone/scripts/|tracking'));
});

test('computeCovered: forms — statisticsParameter requires statistics.spec.ts active', () => {
  assert.ok(
    computeCovered([
      { file: 'statistics.spec.ts', title: 'system statistics', describe: null },
    ]).has('form|statisticsParameter')
  );
  assert.ok(!computeCovered([]).has('form|statisticsParameter'));
});

test('computeCovered: forms — hitsFilter requires the "hits page - filter form" describe in zone-hits.spec.ts', () => {
  // The describe block itself is what the rule matches — parseSpec emits each
  // `test.describe(title, ...)` call as a flat top-level entry.
  assert.ok(
    computeCovered([
      { file: 'zone-hits.spec.ts', title: 'hits page - filter form', describe: null },
    ]).has('form|hitsFilter')
  );
  // Same file, different describe title → not covered.
  assert.ok(
    !computeCovered([
      { file: 'zone-hits.spec.ts', title: 'hits page - other group', describe: null },
    ]).has('form|hitsFilter')
  );
  // No tests at all → not covered.
  assert.ok(!computeCovered([]).has('form|hitsFilter'));
});

test('computeCovered: forms — adminSettings requires the "admin page - settings form" describe in zone-admin.spec.ts', () => {
  // Same describe-as-rule-key pattern as hitsFilter. Sibling describes in the same
  // spec file (e.g. password mismatch, mutating settings) cover additional flows of
  // the same form but are not required to flip the cell.
  assert.ok(
    computeCovered([
      { file: 'zone-admin.spec.ts', title: 'admin page - settings form', describe: null },
    ]).has('form|adminSettings')
  );
  // The mutating-settings sibling describe alone must not flip the cell — the rule
  // is anchored on the primary read-only describe so removing it surfaces the gap.
  assert.ok(
    !computeCovered([
      {
        file: 'zone-admin.spec.ts',
        title: 'admin page - mutating settings (Chromium project only)',
        describe: null,
      },
    ]).has('form|adminSettings')
  );
  // No tests at all → not covered.
  assert.ok(!computeCovered([]).has('form|adminSettings'));
});

test('computeCovered: forms — styleSelector matches the raw `${style} style` template parseSpec produces', () => {
  // visual.spec.ts has `test(\`${page} visual regression - ${style} style\`, ...)` inside
  // a `for (const style of ALL_STYLES)` loop. `parseSpec` captures the template body
  // verbatim (with `${style}` unexpanded) because `expandTemplates` only resolves the
  // `${X.url}` sentinel. The rule must match this raw form, not just a resolved variant.
  assert.ok(
    computeCovered([
      {
        file: 'visual.spec.ts',
        title: 'home page visual regression - ${style} style',
        describe: null,
      },
    ]).has('form|styleSelector')
  );
  // A resolved style name is also accepted (defensive against future refactors that
  // pre-expand the loop).
  assert.ok(
    computeCovered([
      {
        file: 'visual.spec.ts',
        title: 'home page visual regression - purple_rain style',
        describe: null,
      },
    ]).has('form|styleSelector')
  );
  // No style-variant test → not covered.
  assert.ok(
    !computeCovered([
      { file: 'visual.spec.ts', title: 'home page visual regression', describe: null },
    ]).has('form|styleSelector')
  );
});

// === parseSpec: parser edge cases =========================================================

test('parseSpec: skips test.fixme(title, ...) and test.skip(title, ...)', () => {
  const src = `
    import { test } from '@fixtures/base.fixture';
    test('active', { tag: '@regression' }, async () => {});
    test.fixme('disabled', { tag: '@regression' }, async () => {});
    test.skip('also disabled', async () => {});
  `;
  assert.deepEqual(
    parseSpec('demo.spec.ts', src).map((t) => t.title),
    ['active']
  );
});

test('parseSpec: ignores conditional test.skip(fn, msg) statements', () => {
  const src = `
    test.describe('group', { tag: '@regression' }, () => {
      test.skip(({ browserName }) => browserName !== 'chromium', 'reason');
      test('inner', async () => {});
    });
  `;
  assert.deepEqual(
    parseSpec('demo.spec.ts', src)
      .map((t) => t.title)
      .sort(),
    ['group', 'inner'].sort()
  );
});

test('parseSpec: captures property-access titles like test(PageClass.url, ...)', () => {
  const src = `
    for (const PageClass of PUBLIC_PAGE_CLASSES) {
      test(PageClass.url, async ({ page }) => {});
    }
  `;
  const tests = parseSpec('accessibility.spec.ts', src);
  assert.equal(tests.length, 1);
  assert.equal(tests[0].title, '${PageClass.url}');
});

test('parseSpec: captures template-literal titles with substitutions', () => {
  const src = `
    for (const PageClass of PUBLIC_PAGE_CLASSES) {
      test(\`\${PageClass.url} has correct title\`, async ({ page }) => {});
    }
  `;
  const tests = parseSpec('navigation.spec.ts', src);
  assert.equal(tests.length, 1);
  assert.equal(tests[0].title, '${PageClass.url} has correct title');
});

test('parseSpec: ignores `test` token inside a string literal', () => {
  const src = `
    const s = 'test("not-a-real-call", ...)';
    test('real', async () => {});
  `;
  assert.deepEqual(
    parseSpec('demo.spec.ts', src).map((t) => t.title),
    ['real']
  );
});

test('parseSpec: ignores `test` token inside a line comment or block comment', () => {
  const src = `
    // test('commented-out-line', ...)
    /* test('commented-out-block', ...) */
    test('real', async () => {});
  `;
  assert.deepEqual(
    parseSpec('demo.spec.ts', src).map((t) => t.title),
    ['real']
  );
});

test('parseSpec: ignores tokens that share the `test` prefix (e.g. testify, test_helper)', () => {
  const src = `
    testify('not-test', ...);
    test_helper('also-not', ...);
    mytest('not-either', ...);
    test('real', async () => {});
  `;
  assert.deepEqual(
    parseSpec('demo.spec.ts', src).map((t) => t.title),
    ['real']
  );
});

// === expandTemplates: substitution =======================================================

test('expandTemplates: ${X.url} expands to every tracked URL', () => {
  const expanded = expandTemplates([
    { file: 'accessibility.spec.ts', title: '${PageClass.url}', describe: null },
  ]);
  const titles = expanded.map((t) => t.title);
  assert.ok(titles.includes('/'));
  assert.ok(titles.includes('/zone/admin/'));
  // Templates expand to the public + authenticated set (excluding /2/, which the
  // verifier explicitly handles as a special case).
  assert.equal(titles.length, 11);
});

test('expandTemplates: ${X.url} with a suffix preserves the suffix on each expansion', () => {
  const expanded = expandTemplates([
    {
      file: 'navigation.spec.ts',
      title: '${PageClass.url} has correct title',
      describe: null,
    },
  ]);
  const titles = expanded.map((t) => t.title);
  assert.ok(titles.includes('/ has correct title'));
  assert.ok(titles.includes('/zone/admin/ has correct title'));
});

test('expandTemplates: literal titles pass through unchanged', () => {
  const out = expandTemplates([{ file: 'home.spec.ts', title: 'home page', describe: null }]);
  assert.deepEqual(out, [{ file: 'home.spec.ts', title: 'home page', describe: null }]);
});
