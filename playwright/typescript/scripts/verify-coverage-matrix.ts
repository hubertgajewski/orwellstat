// Cross-references `coverage-matrix.json` against active tests in `tests/` so the matrix
// can't silently drift out of sync with what the specs actually cover. Issue #286.
//
// "Active" means a test introduced via `test(...)` or `test.describe(...)` — never via
// `test.fixme(...)` or `test.skip(...)` (file or block level). The matrix is the
// manually-maintained source of truth; this script verifies the truth claims hold.
//
// Mapping rules below encode product knowledge of which spec file + test title covers
// which (page, category) cell. When you add a new spec or category, update both the
// matrix AND the rules here in the same PR — the unit-test fixture catches the omission.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

export type Category = 'title' | 'content' | 'accessibility' | 'visualRegression' | 'api';

export type CoverageMatrix = {
  pages: Record<string, Record<Category, boolean>>;
  forms: Record<string, boolean>;
};

export type ActiveTest = {
  file: string; // basename of spec file, e.g. 'accessibility.spec.ts'
  title: string;
  describe: string | null; // enclosing describe title, if any
};

export type VerifyResult = {
  ok: boolean;
  errors: string[];
};

// Public + authenticated URLs the matrix tracks. `/2/` (PreviouslyAddedPage) is a public
// page that is NOT in `PUBLIC_PAGE_CLASSES` — it is reached via in-page links from `/`,
// so accessibility/api specs that iterate `PUBLIC_PAGE_CLASSES` do not cover it.
const PUBLIC_URLS = [
  '/',
  '/about/',
  '/statistics/',
  '/contact/',
  '/register/',
  '/password_reset/',
] as const;
const AUTHENTICATED_URLS = [
  '/zone/',
  '/zone/stats/',
  '/zone/hits/',
  '/zone/scripts/',
  '/zone/admin/',
] as const;
const PREVIOUSLY_ADDED_URL = '/2/';

// Predicate per (spec file, test title) → which matrix cells it covers when active.
// Keep it conservative: false-positives in the rules become false-negatives in the
// verifier output, which is the safer failure mode.
type CellKey = string; // `${url}|${category}` for pages, `form|${name}` for forms

function pageCell(url: string, category: Category): CellKey {
  return `${url}|${category}`;
}

function formCell(name: string): CellKey {
  return `form|${name}`;
}

export function computeCovered(tests: ActiveTest[]): Set<CellKey> {
  const covered = new Set<CellKey>();
  const has = (file: string, predicate: (t: ActiveTest) => boolean): boolean =>
    tests.some((t) => t.file === file && predicate(t));

  // accessibility — accessibility.spec.ts iterates PUBLIC_PAGE_CLASSES and
  // AUTHENTICATED_PAGE_CLASSES, with each test title equal to PageClass.url.
  for (const url of [...PUBLIC_URLS, ...AUTHENTICATED_URLS]) {
    if (has('accessibility.spec.ts', (t) => t.title === url)) {
      covered.add(pageCell(url, 'accessibility'));
    }
  }

  // api — api.spec.ts has aggregate tests covering all public + all authenticated URLs.
  const publicApiCovered =
    has('api.spec.ts', (t) => t.title === 'public pages without authentication') &&
    has('api.spec.ts', (t) => t.title === 'public pages with authentication');
  const authenticatedApiCovered = has('api.spec.ts', (t) => t.title === 'authenticated pages');
  if (publicApiCovered) {
    for (const url of PUBLIC_URLS) covered.add(pageCell(url, 'api'));
  }
  if (authenticatedApiCovered) {
    for (const url of AUTHENTICATED_URLS) covered.add(pageCell(url, 'api'));
  }

  // title — navigation.spec.ts iterates both PageClass groups with title pattern
  // `${url} has correct title`.
  for (const url of [...PUBLIC_URLS, ...AUTHENTICATED_URLS]) {
    if (has('navigation.spec.ts', (t) => t.title === `${url} has correct title`)) {
      covered.add(pageCell(url, 'title'));
    }
  }
  // /2/ title is asserted via toHaveTitle(PreviouslyAddedPage.title) inside home.spec.ts.
  if (has('home.spec.ts', (t) => t.title === 'home page')) {
    covered.add(pageCell(PREVIOUSLY_ADDED_URL, 'title'));
  }

  // visualRegression — visual.spec.ts has named tests per page.
  const visualRules: ReadonlyArray<readonly [string, string]> = [
    ['/', 'home page visual regression'],
    ['/about/', 'about system page visual regression'],
    ['/contact/', 'contact page visual regression'],
    ['/statistics/', 'statistics page visual regression'],
  ];
  for (const [url, title] of visualRules) {
    if (has('visual.spec.ts', (t) => t.title === title)) {
      covered.add(pageCell(url, 'visualRegression'));
    }
  }

  // content — primary spec file per URL with a recognised named test.
  const contentRules: ReadonlyArray<readonly [string, string, string]> = [
    ['/', 'home.spec.ts', 'home page'],
    [PREVIOUSLY_ADDED_URL, 'home.spec.ts', 'home page'], // home spec navigates to /2/
    ['/about/', 'about-system.spec.ts', 'about system page - headings and statsbar content'],
    ['/contact/', 'contact.spec.ts', 'contact page - headings and statsbar content'],
    ['/statistics/', 'statistics.spec.ts', 'system statistics'],
    ['/register/', 'register.spec.ts', 'register page - content'],
    ['/password_reset/', 'password-reset.spec.ts', 'password reset page - content'],
    ['/zone/', 'zone-information.spec.ts', 'visit-frequency and ranking sections with data'],
    ['/zone/stats/', 'zone-stats.spec.ts', 'SVG chart is rendered on /zone/stats/'],
    ['/zone/hits/', 'zone-hits.spec.ts', 'hits page - content'],
    ['/zone/scripts/', 'zone-scripts.spec.ts', 'scripts page - content'],
  ];
  for (const [url, file, title] of contentRules) {
    if (has(file, (t) => t.title === title)) {
      covered.add(pageCell(url, 'content'));
    }
  }

  // forms — derived from existing active tests.
  if (has('statistics.spec.ts', (t) => t.title === 'system statistics')) {
    covered.add(formCell('statisticsParameter'));
  }
  // Style selector is exercised by visual.spec.ts style-variant tests (titles include
  // "style"). Any active such test counts.
  if (has('visual.spec.ts', (t) => / style$/.test(t.title))) {
    covered.add(formCell('styleSelector'));
  }
  // hitsFilter — covered by the "hits page - filter form" describe block in
  // zone-hits.spec.ts. The parser emits the describe call itself as a top-level entry
  // (with `describe: null`, since it does no nesting tracking), so matching by title
  // on that file is the right key.
  if (has('zone-hits.spec.ts', (t) => t.title === 'hits page - filter form')) {
    covered.add(formCell('hitsFilter'));
  }
  // adminSettings — covered by the "admin page - settings form" describe block in
  // zone-admin.spec.ts. The same parser convention as hitsFilter applies. Sibling
  // describes in the same spec file (password mismatch + mutating settings) exercise
  // additional flows of the same form; the form cell flips to covered as soon as the
  // primary read-only describe is active.
  if (has('zone-admin.spec.ts', (t) => t.title === 'admin page - settings form')) {
    covered.add(formCell('adminSettings'));
  }
  // login — only a test.fixme stub in forms.spec.ts; never covered until that is
  // implemented.

  return covered;
}

export function verify(matrix: CoverageMatrix, tests: ActiveTest[]): VerifyResult {
  const covered = computeCovered(tests);
  const errors: string[] = [];

  // Drift guard: the URL groups that drive the rule predicates above must match the URL
  // set in the matrix. If a new URL is added to the matrix without being added here (or
  // vice versa), every rule keyed off the missing URL silently under-reports — exactly
  // the failure mode this verifier exists to prevent. Set-equality check catches both
  // sides in one pass.
  const matrixUrls = new Set(Object.keys(matrix.pages));
  const knownUrls = new Set<string>([...PUBLIC_URLS, ...AUTHENTICATED_URLS, PREVIOUSLY_ADDED_URL]);
  for (const url of matrixUrls) {
    if (!knownUrls.has(url)) {
      errors.push(
        `unknown URL in matrix: "${url}" — add it to PUBLIC_URLS, AUTHENTICATED_URLS, or PREVIOUSLY_ADDED_URL in scripts/verify-coverage-matrix.ts.`
      );
    }
  }
  for (const url of knownUrls) {
    if (!matrixUrls.has(url)) {
      errors.push(
        `URL "${url}" is in the verifier's URL groups but missing from coverage-matrix.json — add the corresponding pages entry, or remove the URL from the verifier.`
      );
    }
  }

  const categories: Category[] = ['title', 'content', 'accessibility', 'visualRegression', 'api'];
  for (const [url, cells] of Object.entries(matrix.pages)) {
    for (const category of categories) {
      const claimed = cells[category];
      const actual = covered.has(pageCell(url, category));
      if (claimed && !actual) {
        errors.push(
          `false-positive: matrix claims pages["${url}"].${category} = true, but no active test covers it.`
        );
      } else if (!claimed && actual) {
        errors.push(
          `false-negative: an active test covers pages["${url}"].${category}, but the matrix has it as false.`
        );
      }
    }
  }
  for (const [name, claimed] of Object.entries(matrix.forms)) {
    const actual = covered.has(formCell(name));
    if (claimed && !actual) {
      errors.push(
        `false-positive: matrix claims forms["${name}"] = true, but no active test covers it.`
      );
    } else if (!claimed && actual) {
      errors.push(
        `false-negative: an active test covers forms["${name}"], but the matrix has it as false.`
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// Parse a spec file's source into the list of active tests.
// Active = `test(stringTitle, ...)` or `test.describe(stringTitle, ...)` body, never
// `test.fixme(stringTitle, ...)` or `test.skip(stringTitle, ...)`. Calls whose first
// argument is not a string/template literal (e.g. the conditional `test.skip(fn, msg)`
// statement form used for runtime browser-gating) are ignored — they don't define a test.
//
// The title may be a literal string or a template literal whose static parts are kept
// as-is (e.g. `${PageClass.url} has correct title`), letting `expandTemplates()` resolve
// known iteration patterns afterwards.
//
// No describe-disable tracking: the codebase has no `test.describe.fixme/skip` usage.
// If that ever changes, this function needs to grow a bracket-balanced range scanner to
// mark contained `test(...)` calls as disabled.
export function parseSpec(file: string, source: string): ActiveTest[] {
  const out: ActiveTest[] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = skipString(source, i, ch);
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(source, i);
      continue;
    }
    if (matchKeyword(source, i, 'test')) {
      const after = i + 'test'.length;
      // Determine the call kind: `test(`, `test.describe(`, `test.fixme(`, `test.skip(`.
      let kind: 'test' | 'describe' | 'fixme' | 'skip' | null = null;
      let cursor = after;
      if (source[cursor] === '.') {
        const m = /^\.([A-Za-z]+)/.exec(source.slice(cursor));
        if (m) {
          if (m[1] === 'describe') kind = 'describe';
          else if (m[1] === 'fixme') kind = 'fixme';
          else if (m[1] === 'skip') kind = 'skip';
          cursor += m[0].length;
        }
      } else {
        kind = 'test';
      }
      while (cursor < n && /\s/.test(source[cursor])) cursor++;
      if (kind === null || source[cursor] !== '(') {
        i = after;
        continue;
      }
      // First argument: a string literal, a template literal, or a property access of
      // the form `<Identifier>.url` used by loop-generated titles like
      // `test(PageClass.url, ...)`. Calls whose first argument is a function expression
      // (the conditional `test.skip(fn, msg)` runtime-gate form) are correctly ignored.
      let argStart = cursor + 1;
      while (argStart < n && /\s/.test(source[argStart])) argStart++;
      const titleCh = source[argStart];
      let title: string | null = null;
      if (titleCh === "'" || titleCh === '"') {
        const end = skipString(source, argStart, titleCh);
        title = source.slice(argStart + 1, end - 1);
      } else if (titleCh === '`') {
        const end = skipTemplate(source, argStart);
        title = source.slice(argStart + 1, end - 1);
      } else {
        const propMatch = /^([A-Za-z_$][\w$]*)\.url\b/.exec(source.slice(argStart));
        if (propMatch) {
          // Sentinel form recognised by `expandTemplates()` and expanded to every URL
          // tracked by the matrix; harmless extras don't match real rules.
          title = `\${${propMatch[1]}.url}`;
        }
      }
      if (title !== null && (kind === 'test' || kind === 'describe')) {
        out.push({ file: basename(file), title, describe: null });
      }
      i = cursor + 1;
      continue;
    }
    i++;
  }
  return out;
}

function skipString(src: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    i++;
  }
  return src.length;
}

function skipTemplate(src: string, start: number): number {
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') {
      // Skip ${...} expression — match braces.
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        const cc = src[i];
        if (cc === "'" || cc === '"') {
          i = skipString(src, i, cc);
          continue;
        }
        if (cc === '`') {
          i = skipTemplate(src, i);
          continue;
        }
        if (cc === '{') depth++;
        else if (cc === '}') depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return src.length;
}

function matchKeyword(src: string, i: number, kw: string): boolean {
  if (src.slice(i, i + kw.length) !== kw) return false;
  // Boundary: previous char must not be an identifier char
  const prev = src[i - 1];
  if (prev !== undefined && /[A-Za-z0-9_$]/.test(prev)) return false;
  // Next char must not be an identifier char
  const next = src[i + kw.length];
  if (next !== undefined && /[A-Za-z0-9_$]/.test(next)) return false;
  return true;
}

// Resolve template-literal titles where the substituted variable's value is statically
// known. For now we recognise a single pattern used by navigation.spec.ts and
// accessibility.spec.ts: `${PageClass.url}` whose URL set is an iterator over
// PUBLIC_PAGE_CLASSES + AUTHENTICATED_PAGE_CLASSES. The verifier's rules above are
// already expressed in terms of those resolved URL strings, and parseSpec keeps the
// `${...}` token verbatim — so we expand here, producing one ActiveTest per known URL.
export function expandTemplates(tests: ActiveTest[]): ActiveTest[] {
  const allUrls = [...PUBLIC_URLS, ...AUTHENTICATED_URLS];
  const out: ActiveTest[] = [];
  for (const t of tests) {
    const m = /\$\{(?:[A-Za-z_$][\w$]*\.)?url\}(.*)$/.exec(t.title);
    if (!m) {
      out.push(t);
      continue;
    }
    const suffix = m[1];
    const prefix = t.title.slice(0, t.title.length - m[0].length);
    // Heuristic: accessibility.spec.ts uses just `${PageClass.url}` (prefix '' suffix '');
    // navigation.spec.ts uses `${PageClass.url} has correct title`. We expand against
    // the file's declared iteration; if the file doesn't iterate AUTHENTICATED, we still
    // produce all URLs — extras simply don't match real rules so they're harmless.
    for (const url of allUrls) {
      out.push({ ...t, title: `${prefix}${url}${suffix}` });
    }
  }
  return out;
}

async function loadMatrix(matrixPath: string): Promise<CoverageMatrix> {
  return JSON.parse(await readFile(matrixPath, 'utf8')) as CoverageMatrix;
}

async function loadActiveTests(testsDir: string): Promise<ActiveTest[]> {
  const entries = await readdir(testsDir, { withFileTypes: true });
  const specFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.spec.ts'))
    .map((e) => join(testsDir, e.name));
  const all: ActiveTest[] = [];
  for (const f of specFiles) {
    const src = await readFile(f, 'utf8');
    all.push(...parseSpec(f, src));
  }
  return expandTemplates(all);
}

async function main(): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const projectRoot = dirname(here); // playwright/typescript/
  const matrixPath = join(projectRoot, 'coverage-matrix.json');
  const testsDir = join(projectRoot, 'tests');

  const matrix = await loadMatrix(matrixPath);
  const tests = await loadActiveTests(testsDir);
  const result = verify(matrix, tests);

  if (!result.ok) {
    console.error('coverage-matrix.json is out of sync with tests/:\n');
    for (const err of result.errors) console.error(`  ✗ ${err}`);
    console.error(`\n${result.errors.length} mismatch(es).`);
    return 1;
  }
  return 0;
}

// Run only when invoked directly (not when imported by unit tests).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().then((code) => process.exit(code));
}
