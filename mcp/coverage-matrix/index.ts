#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, writeFileSync, renameSync, rmSync, realpathSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import lockfile from 'proper-lockfile';
import { repoRoot, ok, err } from '@orwellstat/mcp-shared';

const PAGE_CATEGORIES = [
  'title',
  'content',
  'accessibility',
  'visualRegression',
  'api',
  'securityHeaders',
  'negativePath',
  'tracking',
] as const;
const GAP_EXCLUDED = new Set(['title', 'api']);

type PageCategory = (typeof PAGE_CATEGORIES)[number];

const matrixSchema = z.object({
  pages: z.record(z.string(), z.record(z.string(), z.boolean())),
  activePageCategories: z.array(z.enum([...PAGE_CATEGORIES])).optional(),
  defaultApplicablePageCategories: z.array(z.enum([...PAGE_CATEGORIES])).optional(),
  pageApplicableCategories: z.record(z.string(), z.array(z.enum([...PAGE_CATEGORIES]))).optional(),
  pageNotes: z.record(z.string(), z.string()).optional(),
  forms: z.record(z.string(), z.boolean()),
});

type CoverageMatrix = z.infer<typeof matrixSchema>;

function matrixPath(): string {
  return join(repoRoot(), 'playwright', 'typescript', 'coverage-matrix.json');
}

function readMatrix(): { matrix?: CoverageMatrix; error?: string } {
  const file = matrixPath();
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    return { error: `Failed to read ${file}: ${(e as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `Failed to parse ${file}: ${(e as Error).message}` };
  }
  const result = matrixSchema.safeParse(parsed);
  if (!result.success) {
    return { error: `Malformed matrix at ${file}: ${result.error.message}` };
  }
  return { matrix: result.data };
}

function pct(covered: number, total: number): number {
  return total > 0 ? Math.round((covered / total) * 100) : 0;
}

function isPageCategory(value: string): value is PageCategory {
  return (PAGE_CATEGORIES as readonly string[]).includes(value);
}

function getActivePageCategories(matrix: CoverageMatrix): PageCategory[] {
  return matrix.activePageCategories ?? [...PAGE_CATEGORIES];
}

function getApplicableCategories(matrix: CoverageMatrix, pageUrl: string): PageCategory[] {
  return (
    matrix.pageApplicableCategories?.[pageUrl] ??
    matrix.defaultApplicablePageCategories ??
    getActivePageCategories(matrix)
  );
}

function getReportableCategories(matrix: CoverageMatrix, pageUrl: string): PageCategory[] {
  const activeCategories = new Set(getActivePageCategories(matrix));
  return getApplicableCategories(matrix, pageUrl).filter((cat) => activeCategories.has(cat));
}

async function getCoverageGaps() {
  const { matrix, error } = readMatrix();
  if (!matrix) return err(error ?? 'unknown error');

  const pages: Record<string, string[]> = {};
  for (const [url, coverage] of Object.entries(matrix.pages)) {
    const missing = getReportableCategories(matrix, url).filter(
      (cat) => !GAP_EXCLUDED.has(cat) && coverage[cat] === false
    );
    if (missing.length > 0) pages[url] = missing;
  }

  const forms = Object.entries(matrix.forms)
    .filter(([, covered]) => !covered)
    .map(([name]) => name);

  return ok({ pages, forms });
}

async function getCoverageSummary() {
  const { matrix, error } = readMatrix();
  if (!matrix) return err(error ?? 'unknown error');

  const categories: Record<string, { covered: number; total: number; percentage: number }> = {};
  const activeCategories = new Set(getActivePageCategories(matrix));
  for (const cat of PAGE_CATEGORIES) {
    if (!activeCategories.has(cat)) {
      categories[cat] = { covered: 0, total: 0, percentage: 0 };
      continue;
    }

    const values = Object.entries(matrix.pages)
      .filter(([url]) => getReportableCategories(matrix, url).includes(cat))
      .map(([, coverage]) => coverage[cat]);
    const covered = values.filter((v) => v).length;
    const total = values.length;
    categories[cat] = { covered, total, percentage: pct(covered, total) };
  }

  const formValues = Object.values(matrix.forms);
  const formCovered = formValues.filter((v) => v).length;
  const formTotal = formValues.length;
  const forms = {
    covered: formCovered,
    total: formTotal,
    percentage: pct(formCovered, formTotal),
  };

  const categoryTotals = Object.values(categories);
  const overallCovered = categoryTotals.reduce((s, c) => s + c.covered, 0) + formCovered;
  const overallTotal = categoryTotals.reduce((s, c) => s + c.total, 0) + formTotal;
  const overall = {
    covered: overallCovered,
    total: overallTotal,
    percentage: pct(overallCovered, overallTotal),
  };

  return ok({ categories, forms, overall });
}

async function markCovered(args: { pageUrl: string; category: string }) {
  const { pageUrl, category } = args;

  if (!isPageCategory(category)) {
    return err(`Invalid category "${category}". Valid categories: ${PAGE_CATEGORIES.join(', ')}`);
  }

  const file = matrixPath();
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(file, {
      retries: { retries: 20, factor: 1.5, minTimeout: 20, maxTimeout: 500 },
    });
  } catch (e) {
    return err(`Failed to acquire lock on ${file}: ${(e as Error).message}`);
  }

  try {
    const { matrix, error } = readMatrix();
    if (!matrix) return err(error ?? 'unknown error');

    if (!(pageUrl in matrix.pages)) {
      return err(
        `Unknown page URL "${pageUrl}". Known URLs: ${Object.keys(matrix.pages).join(', ')}`
      );
    }
    if (!getReportableCategories(matrix, pageUrl).includes(category)) {
      return err(`Category "${category}" is not applicable for page URL "${pageUrl}".`);
    }

    const previous = matrix.pages[pageUrl][category];
    matrix.pages[pageUrl][category] = true;

    // Same-dir tmp file so renameSync stays on one filesystem (atomic).
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(matrix, null, 2) + '\n', 'utf8');
      renameSync(tmp, file);
    } catch (e) {
      rmSync(tmp, { force: true });
      return err(`Failed to write ${file}: ${(e as Error).message}`);
    }

    return ok({
      pageUrl,
      category,
      previous: previous === true,
    });
  } finally {
    await release();
  }
}

const server = new McpServer({ name: 'coverage-matrix', version: '1.0.0' });

server.registerTool(
  'get_coverage_gaps',
  {
    description:
      'Return uncovered entries from coverage-matrix.json: pages grouped by URL with their missing categories (excluding `title` and `api` since those are handled by shared spec files, and also excluding inactive or page-inapplicable categories), plus the list of uncovered form names.',
    inputSchema: {},
  },
  getCoverageGaps
);

server.registerTool(
  'get_coverage_summary',
  {
    description:
      'Return coverage counts and percentages per category (title, content, accessibility, visualRegression, api, securityHeaders, negativePath, tracking), plus forms and an overall percentage. Values match those produced by the test-coverage.yml workflow; inactive categories report 0/0 until activated in coverage-matrix.json.',
    inputSchema: {},
  },
  getCoverageSummary
);

server.registerTool(
  'mark_covered',
  {
    description:
      'Flip a single page-category entry in coverage-matrix.json to true and persist the file. Validates that pageUrl exists, the category is one of: title, content, accessibility, visualRegression, api, securityHeaders, negativePath, tracking, and that the category is applicable for the page. Returns a descriptive error (not an exception) on unknown URL, invalid category, or page/category mismatch.',
    inputSchema: {
      pageUrl: z
        .string()
        .describe('Page URL key in coverage-matrix.json (e.g. "/register/", "/zone/hits/")'),
      category: z
        .enum([...PAGE_CATEGORIES])
        .describe(
          'One of: title, content, accessibility, visualRegression, api, securityHeaders, negativePath, tracking'
        ),
    },
  },
  markCovered
);

export { server, getCoverageGaps, getCoverageSummary, markCovered };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
