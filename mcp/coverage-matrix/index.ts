#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, writeFileSync, realpathSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const PAGE_CATEGORIES = ['title', 'content', 'accessibility', 'visualRegression', 'api'] as const;
const GAP_EXCLUDED = new Set(['title', 'api']);

type PageCategory = (typeof PAGE_CATEGORIES)[number];

const matrixSchema = z.object({
  pages: z.record(z.string(), z.record(z.string(), z.boolean())),
  forms: z.record(z.string(), z.boolean()),
});

type CoverageMatrix = z.infer<typeof matrixSchema>;

function repoRoot(): string {
  return resolve(process.env.REPO_ROOT ?? process.cwd());
}

function matrixPath(): string {
  return join(repoRoot(), 'playwright', 'typescript', 'coverage-matrix.json');
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: `ERROR: ${message}` }],
    isError: true,
  };
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

async function getCoverageGaps() {
  const { matrix, error } = readMatrix();
  if (!matrix) return err(error ?? 'unknown error');

  const pages: Record<string, string[]> = {};
  for (const [url, coverage] of Object.entries(matrix.pages)) {
    const missing = PAGE_CATEGORIES.filter(
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
  for (const cat of PAGE_CATEGORIES) {
    const values = Object.values(matrix.pages)
      .filter((c) => cat in c)
      .map((c) => c[cat]);
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

  const { matrix, error } = readMatrix();
  if (!matrix) return err(error ?? 'unknown error');

  if (!(pageUrl in matrix.pages)) {
    return err(
      `Unknown page URL "${pageUrl}". Known URLs: ${Object.keys(matrix.pages).join(', ')}`
    );
  }

  const previous = matrix.pages[pageUrl][category];
  matrix.pages[pageUrl][category] = true;

  const file = matrixPath();
  try {
    writeFileSync(file, JSON.stringify(matrix, null, 2) + '\n', 'utf8');
  } catch (e) {
    return err(`Failed to write ${file}: ${(e as Error).message}`);
  }

  return ok({
    pageUrl,
    category,
    previous: previous === true,
  });
}

const server = new McpServer({ name: 'coverage-matrix', version: '1.0.0' });

server.registerTool(
  'get_coverage_gaps',
  {
    description:
      'Return uncovered entries from coverage-matrix.json: pages grouped by URL with their missing categories (excluding `title` and `api` since those are handled by shared spec files), plus the list of uncovered form names.',
    inputSchema: {},
  },
  getCoverageGaps
);

server.registerTool(
  'get_coverage_summary',
  {
    description:
      'Return coverage counts and percentages per category (title, content, accessibility, visualRegression, api), plus forms and an overall percentage. Values match those produced by the test-coverage.yml workflow.',
    inputSchema: {},
  },
  getCoverageSummary
);

server.registerTool(
  'mark_covered',
  {
    description:
      'Flip a single page-category entry in coverage-matrix.json to true and persist the file. Validates that pageUrl exists and category is one of: title, content, accessibility, visualRegression, api. Returns a descriptive error (not an exception) on unknown URL or invalid category.',
    inputSchema: {
      pageUrl: z
        .string()
        .describe('Page URL key in coverage-matrix.json (e.g. "/register/", "/zone/hits/")'),
      category: z
        .enum([...PAGE_CATEGORIES])
        .describe('One of: title, content, accessibility, visualRegression, api'),
    },
  },
  markCovered
);

export { server, getCoverageGaps, getCoverageSummary, markCovered };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
