import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PW_DIR = resolve(__dirname, '../../playwright/typescript');
const RESULTS_FILE = join(PW_DIR, 'test-results', 'results.json');

// ---------- types (subset of Playwright JSON reporter output) ----------

interface PwAttachment {
  name: string;
  contentType: string;
  path?: string;
}

interface PwResult {
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  error?: { message?: string };
  attachments: PwAttachment[];
}

interface PwTest {
  projectName: string;
  status: string;
  results: PwResult[];
}

interface PwSpec {
  title: string;
  file: string;
  line: number;
  ok: boolean;
  tests: PwTest[];
}

interface PwSuite {
  title: string;
  file?: string;
  specs: PwSpec[];
  suites?: PwSuite[];
}

interface PwReport {
  suites: PwSuite[];
  stats: {
    expected: number;
    unexpected: number;
    skipped: number;
    duration: number;
  };
}

// ---------- helpers ----------

function readLastReport(): PwReport | null {
  if (!existsSync(RESULTS_FILE)) return null;
  return JSON.parse(readFileSync(RESULTS_FILE, 'utf8')) as PwReport;
}

/** Flatten nested suites into a list of specs with their file paths. */
function collectSpecs(suites: PwSuite[], filePath = ''): Array<{ spec: PwSpec; file: string }> {
  const out: Array<{ spec: PwSpec; file: string }> = [];
  for (const suite of suites) {
    const file = suite.file ?? filePath;
    for (const spec of suite.specs ?? []) {
      out.push({ spec, file });
    }
    if (suite.suites) {
      out.push(...collectSpecs(suite.suites, file));
    }
  }
  return out;
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: `ERROR: ${message}` }], isError: true };
}

// ---------- server ----------

const server = new Server(
  { name: 'playwright-runner', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'run_tests',
      description: 'Run Playwright tests and return structured results.',
      inputSchema: {
        type: 'object',
        properties: {
          spec:    { type: 'string', description: 'Spec file path, e.g. tests/navigation.spec.ts' },
          browser: { type: 'string', enum: ['Chromium', 'Firefox', 'Webkit', 'Mobile Chrome', 'Mobile Safari'] },
          tag:     { type: 'string', description: 'Tag filter, e.g. @smoke or @regression' },
        },
      },
    },
    {
      name: 'get_failed_tests',
      description: 'Return failed tests from the last run with error messages and attachment paths.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_test_attachment',
      description: 'Read the content of a named attachment for a specific test from the last run.',
      inputSchema: {
        type: 'object',
        required: ['testTitle', 'attachmentName'],
        properties: {
          testTitle:      { type: 'string', description: 'Exact test title as shown in the report' },
          attachmentName: { type: 'string', description: 'Attachment name, e.g. "AI diagnosis", "DOM"' },
        },
      },
    },
    {
      name: 'list_tests',
      description: 'List all tests with their spec file and tags without running them.',
      inputSchema: {
        type: 'object',
        properties: {
          tag: { type: 'string', description: 'Filter by tag, e.g. @smoke' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  // ── run_tests ──────────────────────────────────────────────────────────────
  if (name === 'run_tests') {
    const cmd = ['npx', 'playwright', 'test'];
    if (args.spec)    cmd.push(String(args.spec));
    if (args.browser) cmd.push('--project', String(args.browser));
    if (args.tag)     cmd.push('--grep', String(args.tag));

    const result = spawnSync(cmd[0], cmd.slice(1), {
      cwd: PW_DIR,
      encoding: 'utf8',
      timeout: 300_000,
    });

    const report = readLastReport();
    if (!report) return err('Test run completed but results.json was not found.');

    const specs = collectSpecs(report.suites);
    const summary = specs.map(({ spec, file }) => ({
      title:   spec.title,
      file,
      ok:      spec.ok,
      results: spec.tests.map((t) => ({
        project:  t.projectName,
        status:   t.results[0]?.status ?? 'unknown',
        duration: t.results[0]?.duration ?? 0,
        error:    t.results[0]?.error?.message ?? null,
      })),
    }));

    return ok({
      exitCode: result.status ?? -1,
      stats:    report.stats,
      tests:    summary,
    });
  }

  // ── get_failed_tests ───────────────────────────────────────────────────────
  if (name === 'get_failed_tests') {
    const report = readLastReport();
    if (!report) return err('No results.json found — run tests first.');

    const failed = collectSpecs(report.suites)
      .filter(({ spec }) => !spec.ok)
      .map(({ spec, file }) => ({
        title: spec.title,
        file,
        failures: spec.tests
          .filter((t) => t.results[0]?.status !== 'passed')
          .map((t) => ({
            project:     t.projectName,
            status:      t.results[0]?.status,
            error:       t.results[0]?.error?.message ?? null,
            attachments: t.results[0]?.attachments.map((a) => ({
              name: a.name,
              path: a.path,
            })),
          })),
      }));

    return ok({ failedCount: failed.length, tests: failed });
  }

  // ── get_test_attachment ────────────────────────────────────────────────────
  if (name === 'get_test_attachment') {
    const { testTitle, attachmentName } = args as { testTitle: string; attachmentName: string };
    const report = readLastReport();
    if (!report) return err('No results.json found — run tests first.');

    const match = collectSpecs(report.suites).find(({ spec }) => spec.title === testTitle);
    if (!match) return err(`Test not found in last report: "${testTitle}"`);

    for (const test of match.spec.tests) {
      for (const result of test.results) {
        const attachment = result.attachments.find((a) => a.name === attachmentName);
        if (attachment?.path && existsSync(attachment.path)) {
          return ok({
            testTitle,
            attachmentName,
            content: readFileSync(attachment.path, 'utf8'),
          });
        }
      }
    }
    return err(`Attachment "${attachmentName}" not found for test "${testTitle}".`);
  }

  // ── list_tests ─────────────────────────────────────────────────────────────
  if (name === 'list_tests') {
    const cmd = ['npx', 'playwright', 'test', '--list'];
    if (args.tag) cmd.push('--grep', String(args.tag));

    const result = spawnSync(cmd[0], cmd.slice(1), {
      cwd: PW_DIR,
      encoding: 'utf8',
      timeout: 30_000,
    });

    // Output format: "  [Chromium] › tests/navigation.spec.ts:6:1 › home page @smoke"
    const lines = (result.stdout ?? '').split('\n');
    const seen = new Set<string>();
    const tests: Array<{ title: string; file: string; tags: string[] }> = [];

    for (const line of lines) {
      const m = line.match(/›\s+(.+?):(\d+):\d+\s+›\s+(.+)/);
      if (!m) continue;
      const [, file, , titleRaw] = m;
      const tags = [...titleRaw.matchAll(/@\w+/g)].map((t) => t[0]);
      const title = titleRaw.trim();
      const key = `${file}::${title}`;
      if (!seen.has(key)) {
        seen.add(key);
        tests.push({ title, file, tags });
      }
    }

    return ok({ count: tests.length, tests });
  }

  return err(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
