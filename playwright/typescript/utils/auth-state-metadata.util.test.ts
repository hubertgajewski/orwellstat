import { test, describe, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthStateMetadata } from './auth-state-metadata.util.ts';

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('writeAuthStateMetadata', () => {
  test('writes non-secret generation metadata for both auth states', async () => {
    const authDir = await mkdtemp(join(tmpdir(), 'orwellstat-auth-'));
    tempDirs.push(authDir);

    await writeAuthStateMetadata(new URL(`${authDir}/`, 'file://'), {
      env: {
        GITHUB_RUN_ID: '26586112920',
        GITHUB_RUN_ATTEMPT: '3',
        ORWELLSTAT_PASSWORD: 'must-not-be-written',
      },
      now: new Date('2026-05-29T05:10:00.000Z'),
    });

    const raw = await readFile(join(authDir, 'metadata.json'), 'utf8');

    assert.deepEqual(JSON.parse(raw), {
      generatedAt: '2026-05-29T05:10:00.000Z',
      runId: '26586112920',
      runAttempt: '3',
      accounts: ['populated', 'empty'],
    });
    assert.doesNotMatch(raw, /must-not-be-written/);
  });

  test('writes null GitHub identifiers outside GitHub Actions', async () => {
    const authDir = await mkdtemp(join(tmpdir(), 'orwellstat-auth-'));
    tempDirs.push(authDir);

    await writeAuthStateMetadata(new URL(`${authDir}/`, 'file://'), {
      env: {},
      now: new Date('2026-05-29T05:15:00.000Z'),
    });

    const raw = await readFile(join(authDir, 'metadata.json'), 'utf8');

    assert.deepEqual(JSON.parse(raw), {
      generatedAt: '2026-05-29T05:15:00.000Z',
      runId: null,
      runAttempt: null,
      accounts: ['populated', 'empty'],
    });
  });

  test('uses process environment and current time by default', async () => {
    const authDir = await mkdtemp(join(tmpdir(), 'orwellstat-auth-'));
    tempDirs.push(authDir);
    const originalRunId = process.env.GITHUB_RUN_ID;
    const originalRunAttempt = process.env.GITHUB_RUN_ATTEMPT;

    try {
      process.env.GITHUB_RUN_ID = 'default-run-id';
      process.env.GITHUB_RUN_ATTEMPT = '4';
      const before = Date.now();

      await writeAuthStateMetadata(new URL(`${authDir}/`, 'file://'));

      const after = Date.now();
      const raw = await readFile(join(authDir, 'metadata.json'), 'utf8');
      const metadata = JSON.parse(raw);
      const generatedAt = Date.parse(metadata.generatedAt);

      assert.equal(metadata.runId, 'default-run-id');
      assert.equal(metadata.runAttempt, '4');
      assert.deepEqual(metadata.accounts, ['populated', 'empty']);
      assert.ok(Number.isFinite(generatedAt));
      assert.ok(generatedAt >= before);
      assert.ok(generatedAt <= after);
    } finally {
      if (originalRunId === undefined) {
        delete process.env.GITHUB_RUN_ID;
      } else {
        process.env.GITHUB_RUN_ID = originalRunId;
      }
      if (originalRunAttempt === undefined) {
        delete process.env.GITHUB_RUN_ATTEMPT;
      } else {
        process.env.GITHUB_RUN_ATTEMPT = originalRunAttempt;
      }
    }
  });

  test('creates the auth directory when it does not exist', async () => {
    const parentDir = await mkdtemp(join(tmpdir(), 'orwellstat-auth-parent-'));
    tempDirs.push(parentDir);
    const authDir = join(parentDir, 'nested-auth');

    await writeAuthStateMetadata(new URL(`${authDir}/`, 'file://'), {
      env: {},
      now: new Date('2026-05-29T05:20:00.000Z'),
    });

    const raw = await readFile(join(authDir, 'metadata.json'), 'utf8');

    assert.deepEqual(JSON.parse(raw), {
      generatedAt: '2026-05-29T05:20:00.000Z',
      runId: null,
      runAttempt: null,
      accounts: ['populated', 'empty'],
    });
  });
});
