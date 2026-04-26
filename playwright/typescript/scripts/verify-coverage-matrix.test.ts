import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  verify,
  parseSpec,
  expandTemplates,
  type ActiveTest,
  type CoverageMatrix,
} from './verify-coverage-matrix.ts';

// A small in-sync fixture: minimal matrix + matching test inventory. The four scenarios
// listed in issue #286's Definition of Done — false-positive, false-negative, in-sync,
// matrix-edit regression — exercise this fixture by mutating either side.

const inSyncMatrix: CoverageMatrix = {
  pages: {
    '/': {
      title: true,
      content: true,
      accessibility: true,
      visualRegression: true,
      api: true,
    },
    '/zone/stats/': {
      title: true,
      content: false,
      accessibility: true,
      visualRegression: false,
      api: true,
    },
  },
  forms: {
    statisticsParameter: false,
    styleSelector: false,
    login: false,
  },
};

const inSyncTests: ActiveTest[] = expandTemplates([
  // accessibility.spec.ts iterates page classes; one test per URL, title is the URL.
  { file: 'accessibility.spec.ts', title: '/', describe: null },
  { file: 'accessibility.spec.ts', title: '/zone/stats/', describe: null },
  // api.spec.ts named tests covering public + authenticated.
  { file: 'api.spec.ts', title: 'public pages without authentication', describe: null },
  { file: 'api.spec.ts', title: 'public pages with authentication', describe: null },
  { file: 'api.spec.ts', title: 'authenticated pages', describe: null },
  // navigation.spec.ts title-per-URL.
  { file: 'navigation.spec.ts', title: '/ has correct title', describe: null },
  { file: 'navigation.spec.ts', title: '/zone/stats/ has correct title', describe: null },
  // visual + content for `/`.
  { file: 'visual.spec.ts', title: 'home page visual regression', describe: null },
  { file: 'home.spec.ts', title: 'home page', describe: null },
]);

test('verify: in-sync matrix passes with no errors', () => {
  const result = verify(inSyncMatrix, inSyncTests);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('verify: false-positive — matrix claims coverage that no test provides', () => {
  // Flip an empty cell to true; the verifier must flag it.
  const matrix: CoverageMatrix = JSON.parse(JSON.stringify(inSyncMatrix));
  matrix.pages['/zone/stats/'].visualRegression = true;
  const result = verify(matrix, inSyncTests);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /false-positive.*\/zone\/stats\/.*visualRegression/);
});

test('verify: false-negative — a test exists for a cell the matrix says is uncovered', () => {
  // Add a visual regression test for /zone/stats/ without flipping the matrix.
  const tests: ActiveTest[] = [
    ...inSyncTests,
    // Not in the rule set; simulate a different shape: title rule covers /zone/stats/ via
    // the shared visual rule list. To trigger a false-negative, we instead remove the
    // matrix's claim that '/' is covered for visualRegression — that produces a
    // false-negative because home page visual regression DOES exist in inSyncTests.
  ];
  const matrix: CoverageMatrix = JSON.parse(JSON.stringify(inSyncMatrix));
  matrix.pages['/'].visualRegression = false;
  const result = verify(matrix, tests);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /false-negative.*\/.*visualRegression/);
});

test('verify: matrix edit regression — flipping a true cell to false on a covered page is caught', () => {
  // Direct simulation of "someone deleted a covered cell from the matrix by mistake".
  const matrix: CoverageMatrix = JSON.parse(JSON.stringify(inSyncMatrix));
  matrix.pages['/'].accessibility = false;
  const result = verify(matrix, inSyncTests);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /false-negative.*\/.*accessibility/);
});

test('parseSpec: skips test.fixme and test.skip(title, ...) calls', () => {
  const src = `
    import { test } from '@fixtures/base.fixture';
    test('active', { tag: '@regression' }, async () => {});
    test.fixme('disabled', { tag: '@regression' }, async () => {});
    test.skip('also disabled', async () => {});
  `;
  const tests = parseSpec('demo.spec.ts', src);
  assert.deepEqual(
    tests.map((t) => t.title),
    ['active']
  );
});

test('parseSpec: ignores conditional test.skip(fn, msg) statements', () => {
  // The runtime browser-gate form has a function as its first argument and must NOT be
  // recorded as a disabled test definition.
  const src = `
    test.describe('group', { tag: '@regression' }, () => {
      test.skip(({ browserName }) => browserName !== 'chromium', 'reason');
      test('inner', async () => {});
    });
  `;
  const tests = parseSpec('demo.spec.ts', src);
  // 'group' (describe) and 'inner' (test) are recorded; the conditional skip is ignored.
  assert.deepEqual(tests.map((t) => t.title).sort(), ['group', 'inner'].sort());
});

test('parseSpec: captures property-access titles like test(PageClass.url, ...)', () => {
  const src = `
    for (const PageClass of PUBLIC_PAGE_CLASSES) {
      test(PageClass.url, async ({ page }) => {});
    }
  `;
  const tests = parseSpec('accessibility.spec.ts', src);
  assert.equal(tests.length, 1);
  assert.equal(tests[0].title, '\${PageClass.url}');
});

test('expandTemplates: \${X.url} expands to every tracked URL', () => {
  const expanded = expandTemplates([
    { file: 'accessibility.spec.ts', title: '\${PageClass.url}', describe: null },
  ]);
  // Should produce ≥ 1 test per known URL — at minimum '/' and '/zone/' must be present.
  const titles = expanded.map((t) => t.title);
  assert.ok(titles.includes('/'));
  assert.ok(titles.includes('/zone/'));
});

test('expandTemplates: literal titles pass through unchanged', () => {
  const out = expandTemplates([{ file: 'home.spec.ts', title: 'home page', describe: null }]);
  assert.deepEqual(out, [{ file: 'home.spec.ts', title: 'home page', describe: null }]);
});
