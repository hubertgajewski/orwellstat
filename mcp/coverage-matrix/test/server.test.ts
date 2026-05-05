import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getCoverageGaps, getCoverageSummary, markCovered } from '../index.js';

interface ToolResult {
  content: Array<{ text: string }>;
  isError?: boolean;
}

function parseOk(result: ToolResult): unknown {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text);
}

function makeRepo(matrix: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'coverage-matrix-mcp-'));
  mkdirSync(join(root, 'playwright', 'typescript'), { recursive: true });
  writeFileSync(
    join(root, 'playwright', 'typescript', 'coverage-matrix.json'),
    JSON.stringify(matrix, null, 2) + '\n',
    'utf8'
  );
  return root;
}

// Shared category-filtering config used by the three tests that exercise
// activePageCategories / defaultApplicablePageCategories / pageApplicableCategories.
const FILTERED_CATEGORY_CONFIG = {
  activePageCategories: [
    'title',
    'content',
    'accessibility',
    'visualRegression',
    'api',
    'tracking',
  ],
  defaultApplicablePageCategories: [
    'title',
    'content',
    'accessibility',
    'visualRegression',
    'api',
  ],
  pageApplicableCategories: {
    '/scripts/*.php': ['tracking'],
  },
};

const SAMPLE_MATRIX = {
  pages: {
    '/a/': {
      title: true,
      content: false,
      accessibility: true,
      visualRegression: false,
      api: true,
      securityHeaders: false,
      negativePath: true,
      tracking: false,
    },
    '/b/': {
      title: true,
      content: true,
      accessibility: true,
      visualRegression: true,
      api: false,
      securityHeaders: false,
      negativePath: false,
      tracking: true,
    },
    '/c/': {
      title: false,
      content: false,
      accessibility: false,
      visualRegression: false,
      api: false,
      securityHeaders: false,
      negativePath: false,
      tracking: false,
    },
  },
  forms: {
    f1: true,
    f2: false,
  },
};

describe('coverage-matrix MCP', () => {
  const savedEnv = { ...process.env };
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = makeRepo(SAMPLE_MATRIX);
    process.env.REPO_ROOT = repoRoot;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    rmSync(repoRoot, { recursive: true, force: true });
  });

  describe('get_coverage_gaps', () => {
    it('returns false entries grouped by URL, excluding title and api', async () => {
      const data = parseOk(await getCoverageGaps()) as {
        pages: Record<string, string[]>;
        forms: string[];
      };
      expect(data.pages).toEqual({
        '/a/': ['content', 'visualRegression', 'securityHeaders', 'tracking'],
        '/b/': ['securityHeaders', 'negativePath'],
        '/c/': [
          'content',
          'accessibility',
          'visualRegression',
          'securityHeaders',
          'negativePath',
          'tracking',
        ],
      });
      expect(data.forms).toEqual(['f2']);
    });

    it('omits pages whose only false entries are title or api', async () => {
      const root = makeRepo({
        pages: {
          '/title-only-gap/': {
            title: false,
            content: true,
            accessibility: true,
            visualRegression: true,
            api: true,
            securityHeaders: true,
            negativePath: true,
            tracking: true,
          },
          '/api-only-gap/': {
            title: true,
            content: true,
            accessibility: true,
            visualRegression: true,
            api: false,
            securityHeaders: true,
            negativePath: true,
            tracking: true,
          },
        },
        forms: {},
      });
      process.env.REPO_ROOT = root;
      try {
        const data = parseOk(await getCoverageGaps()) as {
          pages: Record<string, string[]>;
        };
        expect(data.pages).toEqual({});
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('omits inactive and page-inapplicable categories from gaps', async () => {
      const root = makeRepo({
        pages: {
          '/page/': {
            title: true,
            content: false,
            accessibility: true,
            visualRegression: false,
            api: true,
            securityHeaders: false,
            negativePath: false,
            tracking: false,
          },
          '/scripts/*.php': {
            title: false,
            content: false,
            accessibility: false,
            visualRegression: false,
            api: false,
            securityHeaders: false,
            negativePath: false,
            tracking: true,
          },
        },
        ...FILTERED_CATEGORY_CONFIG,
        forms: {},
      });
      process.env.REPO_ROOT = root;
      try {
        const data = parseOk(await getCoverageGaps()) as {
          pages: Record<string, string[]>;
        };
        expect(data.pages).toEqual({
          '/page/': ['content', 'visualRegression'],
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('returns an error when the matrix file is missing', async () => {
      process.env.REPO_ROOT = mkdtempSync(join(tmpdir(), 'coverage-matrix-mcp-empty-'));
      try {
        const result = await getCoverageGaps();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/Failed to read/);
      } finally {
        rmSync(process.env.REPO_ROOT!, { recursive: true, force: true });
      }
    });

    it('returns an error when the matrix file is malformed JSON', async () => {
      writeFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        '{ not valid'
      );
      const result = await getCoverageGaps();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Failed to parse/);
    });
  });

  describe('get_coverage_summary', () => {
    it('returns per-category, forms, and overall counts and percentages', async () => {
      const data = parseOk(await getCoverageSummary()) as {
        categories: Record<string, { covered: number; total: number; percentage: number }>;
        forms: { covered: number; total: number; percentage: number };
        overall: { covered: number; total: number; percentage: number };
      };
      expect(data.categories).toEqual({
        title: { covered: 2, total: 3, percentage: 67 },
        content: { covered: 1, total: 3, percentage: 33 },
        accessibility: { covered: 2, total: 3, percentage: 67 },
        visualRegression: { covered: 1, total: 3, percentage: 33 },
        api: { covered: 1, total: 3, percentage: 33 },
        securityHeaders: { covered: 0, total: 3, percentage: 0 },
        negativePath: { covered: 1, total: 3, percentage: 33 },
        tracking: { covered: 1, total: 3, percentage: 33 },
      });
      expect(data.forms).toEqual({ covered: 1, total: 2, percentage: 50 });
      expect(data.overall).toEqual({ covered: 10, total: 26, percentage: 38 });
    });

    it('matches values produced by the test-coverage.yml workflow logic', async () => {
      const matrix = {
        pages: {
          '/x/': {
            title: true,
            content: true,
            accessibility: false,
            visualRegression: false,
            api: true,
            securityHeaders: false,
            negativePath: false,
            tracking: true,
          },
          '/y/': {
            title: true,
            content: false,
            accessibility: true,
            visualRegression: false,
            api: true,
            securityHeaders: false,
            negativePath: true,
            tracking: false,
          },
        },
        forms: { a: true, b: true, c: false, d: false },
      };
      const root = makeRepo(matrix);
      process.env.REPO_ROOT = root;
      try {
        const data = parseOk(await getCoverageSummary()) as {
          categories: Record<string, { percentage: number }>;
          forms: { percentage: number };
          overall: { covered: number; total: number; percentage: number };
        };
        const allValues = [
          ...Object.values(matrix.pages).flatMap((c) => Object.values(c)),
          ...Object.values(matrix.forms),
        ];
        const expectedOverall = Math.round(
          (allValues.filter(Boolean).length / allValues.length) * 100
        );
        expect(data.overall.percentage).toBe(expectedOverall);
        expect(data.categories.title.percentage).toBe(100);
        expect(data.categories.content.percentage).toBe(50);
        expect(data.forms.percentage).toBe(50);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('counts only active and page-applicable categories in totals', async () => {
      const root = makeRepo({
        pages: {
          '/page/': {
            title: true,
            content: false,
            accessibility: true,
            visualRegression: false,
            api: true,
            securityHeaders: true,
            negativePath: false,
            tracking: false,
          },
          '/scripts/*.php': {
            title: false,
            content: false,
            accessibility: false,
            visualRegression: false,
            api: false,
            securityHeaders: false,
            negativePath: false,
            tracking: true,
          },
        },
        ...FILTERED_CATEGORY_CONFIG,
        forms: { f1: true, f2: false },
      });
      process.env.REPO_ROOT = root;
      try {
        const data = parseOk(await getCoverageSummary()) as {
          categories: Record<string, { covered: number; total: number; percentage: number }>;
          overall: { covered: number; total: number; percentage: number };
        };
        expect(data.categories.securityHeaders).toEqual({ covered: 0, total: 0, percentage: 0 });
        expect(data.categories.tracking).toEqual({ covered: 1, total: 1, percentage: 100 });
        expect(data.overall).toEqual({ covered: 5, total: 8, percentage: 63 });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('reports 0% gracefully when forms section is empty', async () => {
      const root = makeRepo({
        pages: SAMPLE_MATRIX.pages,
        forms: {},
      });
      process.env.REPO_ROOT = root;
      try {
        const data = parseOk(await getCoverageSummary()) as {
          forms: { covered: number; total: number; percentage: number };
        };
        expect(data.forms).toEqual({ covered: 0, total: 0, percentage: 0 });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('mark_covered', () => {
    function readMatrix(): { pages: Record<string, Record<string, boolean>> } {
      const raw = readFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        'utf8'
      );
      return JSON.parse(raw);
    }

    it('flips a false entry to true and persists the file', async () => {
      const result = await markCovered({ pageUrl: '/a/', category: 'content' });
      const data = parseOk(result) as {
        pageUrl: string;
        category: string;
        previous: boolean;
      };
      expect(data).toEqual({
        pageUrl: '/a/',
        category: 'content',
        previous: false,
      });
      expect(readMatrix().pages['/a/'].content).toBe(true);
    });

    it('is idempotent on an already-covered entry', async () => {
      const result = await markCovered({ pageUrl: '/a/', category: 'title' });
      const data = parseOk(result) as { previous: boolean };
      expect(data.previous).toBe(true);
      expect(readMatrix().pages['/a/'].title).toBe(true);
    });

    it('returns a descriptive error for an unknown page URL and does not modify the file', async () => {
      const before = readFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        'utf8'
      );
      const result = await markCovered({
        pageUrl: '/missing/',
        category: 'content',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Unknown page URL "\/missing\/"/);
      expect(result.content[0].text).toMatch(/Known URLs:/);
      const after = readFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        'utf8'
      );
      expect(after).toBe(before);
    });

    it('returns a descriptive error for an invalid category and does not modify the file', async () => {
      const before = readFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        'utf8'
      );
      const result = await markCovered({ pageUrl: '/a/', category: 'forms' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Invalid category "forms"/);
      expect(result.content[0].text).toMatch(/Valid categories:/);
      const after = readFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        'utf8'
      );
      expect(after).toBe(before);
    });

    it('returns a descriptive error for a category that is not applicable to that page', async () => {
      const root = makeRepo({
        pages: {
          '/scripts/*.php': {
            title: false,
            content: false,
            accessibility: false,
            visualRegression: false,
            api: false,
            securityHeaders: false,
            negativePath: false,
            tracking: true,
          },
        },
        ...FILTERED_CATEGORY_CONFIG,
        forms: {},
      });
      process.env.REPO_ROOT = root;
      try {
        const result = await markCovered({ pageUrl: '/scripts/*.php', category: 'content' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/not applicable/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('serialises ≥5 concurrent markCovered calls; every flip lands', async () => {
      const calls = [
        { pageUrl: '/a/', category: 'content' },
        { pageUrl: '/a/', category: 'visualRegression' },
        { pageUrl: '/c/', category: 'title' },
        { pageUrl: '/c/', category: 'content' },
        { pageUrl: '/c/', category: 'accessibility' },
        { pageUrl: '/c/', category: 'visualRegression' },
        { pageUrl: '/c/', category: 'api' },
      ];
      const results = await Promise.all(calls.map((c) => markCovered(c)));
      for (const r of results) {
        expect(r.isError).toBeFalsy();
      }
      const final = readMatrix();
      expect(final.pages['/a/'].content).toBe(true);
      expect(final.pages['/a/'].visualRegression).toBe(true);
      expect(final.pages['/c/'].title).toBe(true);
      expect(final.pages['/c/'].content).toBe(true);
      expect(final.pages['/c/'].accessibility).toBe(true);
      expect(final.pages['/c/'].visualRegression).toBe(true);
      expect(final.pages['/c/'].api).toBe(true);
      expect(final.pages['/b/']).toEqual(SAMPLE_MATRIX.pages['/b/']);
    });

    it('preserves trailing newline and JSON structure when writing', async () => {
      await markCovered({ pageUrl: '/a/', category: 'content' });
      const raw = readFileSync(
        join(repoRoot, 'playwright', 'typescript', 'coverage-matrix.json'),
        'utf8'
      );
      expect(raw.endsWith('\n')).toBe(true);
      const reparsed = JSON.parse(raw);
      expect(reparsed.pages['/a/'].content).toBe(true);
      expect(reparsed.pages['/b/']).toEqual(SAMPLE_MATRIX.pages['/b/']);
      expect(reparsed.forms).toEqual(SAMPLE_MATRIX.forms);
    });
  });
});
