#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawnSync } from 'child_process';
import { readFileSync, realpathSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { repoRoot, ok, err } from '@orwellstat/mcp-shared';

function scriptPath(): string {
  return join(repoRoot(), 'scripts', 'generate-quality-metrics.py');
}
function historyFile(): string {
  return join(repoRoot(), 'quality-metrics-history.json');
}
function pythonExe(): string {
  return process.env.PYTHON ?? 'python3';
}

interface ScriptOutput {
  total_bugs: number;
  counts: {
    'found-by-test': number;
    'found-by-manual-testing': number;
    'found-in-production': number;
  };
  escape_rate: string;
  mttr: {
    all: string;
    'found-by-test': string;
    'found-by-manual-testing': string;
    'found-in-production': string;
  };
}

interface HistoryPoint {
  date: string;
  escape_rate: string;
  mttr: string;
  coverage: string;
}

function runScript(): { data?: ScriptOutput; error?: string } {
  const python = pythonExe();
  const script = scriptPath();
  const result = spawnSync(python, [script, '--json'], {
    cwd: repoRoot(),
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) return { error: `Failed to spawn ${python}: ${result.error.message}` };
  if (result.status !== 0) {
    return { error: `${script} exited with status ${result.status}: ${result.stderr ?? ''}` };
  }
  try {
    return { data: JSON.parse(result.stdout) as ScriptOutput };
  } catch (e) {
    return { error: `Failed to parse --json output: ${(e as Error).message}` };
  }
}

async function getDefectEscapeRate() {
  const { data, error } = runScript();
  if (!data) return err(error ?? 'unknown error');
  if (data.total_bugs === 0) {
    return ok({
      message: 'No bug issues found',
      total_bugs: 0,
      counts: data.counts,
      escape_rate: data.escape_rate,
    });
  }
  return ok({
    total_bugs: data.total_bugs,
    counts: data.counts,
    escape_rate: data.escape_rate,
  });
}

async function getMttr() {
  const { data, error } = runScript();
  if (!data) return err(error ?? 'unknown error');
  if (data.total_bugs === 0) {
    return ok({ message: 'No bug issues found', mttr: data.mttr });
  }
  return ok({ mttr: data.mttr });
}

async function getMetricsHistory() {
  const file = historyFile();
  try {
    const raw = readFileSync(file, 'utf8');
    const history = JSON.parse(raw) as HistoryPoint[];
    return ok({ count: history.length, history });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return ok({ count: 0, history: [] });
    return err(`Failed to read ${file}: ${(e as Error).message}`);
  }
}

const server = new McpServer({ name: 'quality-metrics', version: '1.0.0' });

server.registerTool(
  'get_defect_escape_rate',
  {
    description:
      'Return defect escape rate percentage and bug issue counts per discovery label (found-by-test, found-by-manual-testing, found-in-production). Matches QUALITY_METRICS.md.',
    inputSchema: {},
  },
  getDefectEscapeRate
);

server.registerTool(
  'get_mttr',
  {
    description:
      'Return mean time to resolve (days/hours) for all closed bug issues and broken down per discovery label. Matches QUALITY_METRICS.md.',
    inputSchema: {},
  },
  getMttr
);

server.registerTool(
  'get_metrics_history',
  {
    description:
      'Return all historical data points from quality-metrics-history.json (date, escape_rate, mttr, coverage) as structured JSON.',
    inputSchema: {},
  },
  getMetricsHistory
);

export { server, runScript, getDefectEscapeRate, getMttr, getMetricsHistory };

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
