import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import {
  getDefectEscapeRate,
  getMetricsHistory,
  getMttr,
} from '../index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FAKE_PYTHON = join(FIXTURES, 'fake-python.sh');
const METRICS_WITH_BUGS = join(FIXTURES, 'metrics-with-bugs.json');
const METRICS_ZERO_BUGS = join(FIXTURES, 'metrics-zero-bugs.json');
const METRICS_BAD_JSON = join(FIXTURES, 'metrics-bad-json.txt');
const REPO_WITH_HISTORY = join(FIXTURES, 'repo-with-history');
const REPO_NO_HISTORY = join(FIXTURES, 'repo-no-history');

function parseOk(result: { content: Array<{ text: string }>; isError?: boolean }): unknown {
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text);
}

describe('quality-metrics MCP', () => {
  beforeEach(() => {
    vi.stubEnv('PYTHON', FAKE_PYTHON);
    vi.stubEnv('REPO_ROOT', REPO_WITH_HISTORY);
    vi.stubEnv('FAKE_OUTPUT', undefined);
    vi.stubEnv('FAKE_EXIT_CODE', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('get_defect_escape_rate', () => {
    it('returns escape rate and counts when bugs exist', async () => {
      vi.stubEnv('FAKE_OUTPUT', METRICS_WITH_BUGS);
      const data = parseOk(await getDefectEscapeRate()) as {
        total_bugs: number;
        counts: Record<string, number>;
        escape_rate: string;
        message?: string;
      };
      expect(data.total_bugs).toBe(7);
      expect(data.counts).toEqual({
        'found-by-test': 5,
        'found-by-manual-testing': 1,
        'found-in-production': 1,
      });
      expect(data.escape_rate).toBe('14%');
      expect(data.message).toBeUndefined();
    });

    it('returns a clear message when there are zero bugs', async () => {
      vi.stubEnv('FAKE_OUTPUT', METRICS_ZERO_BUGS);
      const data = parseOk(await getDefectEscapeRate()) as {
        message: string;
        total_bugs: number;
        escape_rate: string;
      };
      expect(data.message).toBe('No bug issues found');
      expect(data.total_bugs).toBe(0);
      expect(data.escape_rate).toBe('N/A');
    });

    it('returns an error result when the script fails', async () => {
      vi.stubEnv('FAKE_EXIT_CODE', '1');
      const result = await getDefectEscapeRate();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/exited with status 1/);
    });

    it('returns an error result when the python binary cannot be spawned', async () => {
      vi.stubEnv('PYTHON', '/does/not/exist/python');
      vi.stubEnv('FAKE_OUTPUT', METRICS_WITH_BUGS);
      const result = await getDefectEscapeRate();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Failed to spawn|exited with status/);
    });

    it('returns an error result when the script emits invalid JSON', async () => {
      vi.stubEnv('FAKE_OUTPUT', METRICS_BAD_JSON);
      const result = await getDefectEscapeRate();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Failed to parse --json output/);
    });
  });

  describe('get_mttr', () => {
    it('returns MTTR breakdown when bugs exist', async () => {
      vi.stubEnv('FAKE_OUTPUT', METRICS_WITH_BUGS);
      const data = parseOk(await getMttr()) as {
        mttr: Record<string, string>;
        message?: string;
      };
      expect(data.mttr.all).toBe('1.4 days');
      expect(data.mttr['found-by-test']).toBe('2.3 days');
      expect(data.mttr['found-by-manual-testing']).toBe('2.2 hours');
      expect(data.mttr['found-in-production']).toBe('0.4 hours');
      expect(data.message).toBeUndefined();
    });

    it('returns a clear message and passes through N/A values when zero bugs', async () => {
      vi.stubEnv('FAKE_OUTPUT', METRICS_ZERO_BUGS);
      const data = parseOk(await getMttr()) as {
        message: string;
        mttr: Record<string, string>;
      };
      expect(data.message).toBe('No bug issues found');
      expect(data.mttr.all).toBe('N/A (no closed bugs)');
    });

    it('propagates runScript errors as isError results', async () => {
      vi.stubEnv('FAKE_EXIT_CODE', '2');
      const result = await getMttr();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/exited with status 2/);
    });
  });

  describe('get_metrics_history', () => {
    it('returns all data points from the history file', async () => {
      const data = parseOk(await getMetricsHistory()) as {
        count: number;
        history: Array<{ date: string }>;
      };
      expect(data.count).toBe(2);
      expect(data.history.map((p) => p.date)).toEqual(['2026-01-01', '2026-02-01']);
    });

    it('returns empty history when the file is missing', async () => {
      vi.stubEnv('REPO_ROOT', REPO_NO_HISTORY);
      const data = parseOk(await getMetricsHistory()) as {
        count: number;
        history: unknown[];
      };
      expect(data.count).toBe(0);
      expect(data.history).toEqual([]);
    });

    it('returns an error result when the history file is malformed JSON', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'qm-bad-history-'));
      try {
        writeFileSync(join(dir, 'quality-metrics-history.json'), '{ not valid');
        vi.stubEnv('REPO_ROOT', dir);
        const result = await getMetricsHistory();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/Failed to read/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
