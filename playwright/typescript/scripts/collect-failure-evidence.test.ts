import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFailureEvidence } from './collect-failure-evidence.ts';

const tempDirs: string[] = [];
const CLI_TIMEOUT_MS = 30_000;

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orwellstat-failure-evidence-'));
  tempDirs.push(dir);
  return dir;
}

async function writeFixture(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new assert.AssertionError({ message: 'Expected a plain object' });
  }
}

function assertRecordArray(value: unknown): asserts value is Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new assert.AssertionError({ message: 'Expected an array' });
  }
  for (const item of value) assertRecord(item);
}

function assertFsErrorCode(error: unknown, code: string): true {
  assertRecord(error);
  assert.equal(error.code, code);
  return true;
}

test('collects failed retry attachments into a readable evidence index', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const firstAttempt = join(source, 'navigation-zone-hits-Webkit');
  const retryAttempt = join(source, 'navigation-zone-hits-Webkit-retry1');

  await writeFixture(join(firstAttempt, 'test-failed-1.png'), 'png');
  await writeFixture(join(firstAttempt, 'video.webm'), 'video');
  await writeFixture(join(firstAttempt, 'console.log'), 'console');
  await writeFixture(join(firstAttempt, 'error-context.md'), 'context');
  await writeFixture(join(firstAttempt, 'selector-fix.md'), 'selector fix');
  await writeFixture(join(firstAttempt, 'attachments', 'DOM-123.xhtml'), '<html></html>');
  await writeFixture(join(firstAttempt, 'attachments', 'AI-diagnosis-123.md'), 'diagnosis');
  await writeFixture(join(retryAttempt, 'trace.zip'), 'trace');

  const results = {
    suites: [
      {
        specs: [
          {
            file: 'navigation.spec.ts',
            line: 20,
            title: '/zone/hits/ has correct title',
            tests: [
              {
                projectName: 'Webkit',
                results: [
                  {
                    retry: 0,
                    status: 'timedOut',
                    duration: 35_164,
                    error: { message: '\u001b[31mTest timeout of 30000ms exceeded.\u001b[39m' },
                    attachments: [
                      {
                        name: 'screenshot',
                        contentType: 'image/png',
                        path: join(firstAttempt, 'test-failed-1.png'),
                      },
                      {
                        name: 'DOM',
                        contentType: 'text/html',
                        path: join(firstAttempt, 'attachments', 'DOM-123.xhtml'),
                      },
                      {
                        name: 'AI diagnosis',
                        contentType: 'text/plain',
                        path: join(firstAttempt, 'attachments', 'AI-diagnosis-123.md'),
                      },
                      {
                        name: 'console logs',
                        contentType: 'text/plain',
                        path: join(firstAttempt, 'console.log'),
                      },
                      {
                        name: 'video',
                        contentType: 'video/webm',
                        path: join(firstAttempt, 'video.webm'),
                      },
                      {
                        name: 'error-context',
                        contentType: 'text/markdown',
                        path: join(firstAttempt, 'error-context.md'),
                      },
                      {
                        name: 'Selector fix',
                        contentType: 'text/plain',
                        path: join(firstAttempt, 'selector-fix.md'),
                      },
                    ],
                  },
                  {
                    retry: 1,
                    status: 'failed',
                    duration: 1200,
                    errors: [{ message: 'Expected title to match' }],
                    attachments: [
                      {
                        name: 'trace',
                        contentType: 'application/zip',
                        path: join(retryAttempt, 'trace.zip'),
                      },
                    ],
                  },
                  {
                    retry: 2,
                    status: 'passed',
                    duration: 900,
                    attachments: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  await writeFixture(join(source, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    runId: '28742473811',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.equal(manifest.failures.length, 2);
  assert.equal(manifest.failures[0].title, '/zone/hits/ has correct title');
  assert.equal(manifest.failures[0].retry, 0);
  assert.equal(manifest.failures[0].attachments.length, 7);
  assert.deepEqual(
    manifest.failures[0].attachments.map((attachment) => attachment.outputPath),
    [
      'failures/F001-R0/screenshot.png',
      'failures/F001-R0/DOM.xhtml',
      'failures/F001-R0/AI-diagnosis.md',
      'failures/F001-R0/console-logs.log',
      'failures/F001-R0/video.webm',
      'failures/F001-R0/error-context.md',
      'failures/F001-R0/Selector-fix.md',
    ]
  );
  assert.equal(
    await readFile(join(out, manifest.failures[0].attachments[0].outputPath), 'utf8'),
    'png'
  );
  assert.equal(await readFile(join(out, 'failures/F002-R1/trace.zip'), 'utf8'), 'trace');

  const manifestJson: unknown = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
  assertRecord(manifestJson);
  assert.equal(manifestJson.artifactName, 'failure-evidence-webkit-1');
  assert.equal(manifestJson.runId, '28742473811');
  assert.equal(manifestJson.project, 'Webkit');
  assert.equal(manifestJson.shard, '1');
  assert.equal(manifestJson.totalShards, '2');
  assert.equal(manifestJson.resultsPath, 'results.json');
  assertRecordArray(manifestJson.failures);
  assert.equal(manifestJson.failures.length, 2);
  const firstFailure = manifestJson.failures[0];
  assert.equal(firstFailure.attemptId, 'F001-R0');
  assert.equal(firstFailure.duration, 35164);
  assert.equal(firstFailure.error, 'Test timeout of 30000ms exceeded.');
  assertRecordArray(firstFailure.attachments);
  assert.equal('sourcePath' in firstFailure.attachments[0], false);
  assert.equal(
    await readFile(join(out, 'results.json'), 'utf8'),
    `${JSON.stringify(results, null, 2)}\n`
  );

  const index = await readFile(join(out, 'index.md'), 'utf8');
  assert.match(index, /# Playwright Failure Evidence/);
  assert.match(index, /\| Run \| 28742473811 \|/);
  assert.match(index, /\| Artifact \| failure-evidence-webkit-1 \|/);
  assert.match(
    index,
    /\| Download command \| gh run download 28742473811 --name failure-evidence-webkit-1 \|/
  );
  assert.match(index, /\| Results \| results\.json \|/);
  assert.match(index, /## Error F001-R0/);
  assert.match(index, /\| Test \| navigation\.spec\.ts:20 - \/zone\/hits\/ has correct title \|/);
  assert.match(index, /\| Duration \| 35164ms \|/);
  assert.match(index, /\| Error message \| Test timeout of 30000ms exceeded\. \|/);
  assert.doesNotMatch(index, /\u001b|\[31m|\[39m/);
  assert.doesNotMatch(index, /\/test-results\/results\.json/);
  assert.match(
    index,
    /\| F001-R0 \| screenshot\.png \| failure-evidence-webkit-1 \| failures\/F001-R0\/screenshot\.png \|/
  );
  assert.match(
    index,
    /\| F002-R1 \| trace\.zip \| failure-evidence-webkit-1 \| failures\/F002-R1\/trace\.zip \|/
  );
});

test('starts from a fresh output directory before collecting evidence', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');

  await writeFixture(join(source, 'results.json'), `${JSON.stringify({ suites: [] })}\n`);
  await writeFixture(join(out, 'unexpected-secret.txt'), 'stale');
  await writeFixture(join(out, 'failures', 'old.txt'), 'stale');

  await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '1',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  await assert.rejects(readFile(join(out, 'unexpected-secret.txt'), 'utf8'), (error) =>
    assertFsErrorCode(error, 'ENOENT')
  );
  await assert.rejects(readFile(join(out, 'failures', 'old.txt'), 'utf8'), (error) =>
    assertFsErrorCode(error, 'ENOENT')
  );
});

test('rejects a symlinked output directory', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const realOut = join(root, 'real-output');
  const out = join(root, 'failure-evidence');

  await writeFixture(join(source, 'results.json'), `${JSON.stringify({ suites: [] })}\n`);
  await mkdir(realOut);
  await symlink(realOut, out, 'dir');

  await assert.rejects(
    collectFailureEvidence({
      resultsPath: join(source, 'results.json'),
      sourceDir: source,
      outDir: out,
      project: 'Webkit',
      shard: '1',
      totalShards: '1',
      artifactName: 'failure-evidence-webkit-1',
      generatedAt: '2026-07-05T12:00:00.000Z',
    }),
    (error) => assertFsErrorCode(error, 'ELOOP')
  );
});

test('writes an empty index when results.json is missing', async () => {
  const root = await makeTempDir();
  const manifest = await collectFailureEvidence({
    resultsPath: join(root, 'test-results', 'results.json'),
    sourceDir: join(root, 'test-results'),
    outDir: join(root, 'failure-evidence'),
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    runId: null,
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.warnings.length, 1);
  const index = await readFile(join(root, 'failure-evidence', 'index.md'), 'utf8');
  assert.match(index, /No results/);
  assert.match(index, /\| Download command \| not available \|/);
  assert.match(index, /\| Results \| not produced \|/);
});

test('writes a warning index when results.json is malformed', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(join(source, 'results.json'), '{not json');

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(manifest.failures, []);
  assert.match(manifest.warnings[0], /Could not parse results/);
  assert.match(await readFile(join(out, 'index.md'), 'utf8'), /Could not parse results/);
});

test('rejects unexpected filesystem errors while reading results.json', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const directoryResultPath = join(source, 'results.json');
  await mkdir(directoryResultPath, { recursive: true });

  await assert.rejects(
    collectFailureEvidence({
      resultsPath: directoryResultPath,
      sourceDir: source,
      outDir: out,
      project: 'Webkit',
      shard: '1',
      totalShards: '2',
      artifactName: 'failure-evidence-webkit-1',
      generatedAt: '2026-07-05T12:00:00.000Z',
    }),
    (error: unknown) => assertFsErrorCode(error, 'EISDIR')
  );
});

test('does not read a symlinked results file that resolves outside the source directory', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const outsideResults = join(root, 'outside-results.json');
  const symlinkedResults = join(source, 'results.json');

  await writeFixture(
    outsideResults,
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'storage-state.spec.ts',
              title: 'outside storage state',
              tests: [],
            },
          ],
        },
      ],
      cookies: [{ name: 'session', value: 'plain-secret-cookie' }],
    })}\n`
  );
  await mkdir(source, { recursive: true });
  await symlink(outsideResults, symlinkedResults);

  const manifest = await collectFailureEvidence({
    resultsPath: symlinkedResults,
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(manifest.failures, []);
  assert.deepEqual(manifest.warnings, ['Results file path is outside source directory.']);
  assert.equal(manifest.resultsPath, null);
  await assert.rejects(readFile(join(out, 'results.json'), 'utf8'));
  assert.doesNotMatch(await readFile(join(out, 'index.md'), 'utf8'), /plain-secret-cookie/);
});

test('writes a warning index when results.json is valid but not an object', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(join(source, 'results.json'), '[]\n');

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(manifest.failures, []);
  assert.deepEqual(manifest.warnings, ['results.json did not contain a Playwright JSON object.']);
  assert.equal(manifest.resultsPath, 'results.json');
  assert.equal(await readFile(join(out, 'results.json'), 'utf8'), '[]\n');
  assert.match(
    await readFile(join(out, 'index.md'), 'utf8'),
    /results\.json did not contain a Playwright JSON object\./
  );
});

test('surfaces top-level Playwright errors when no failed attempts exist', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      errors: [{ message: 'Global setup failed before tests started' }],
      suites: [],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(manifest.failures, []);
  assert.match(manifest.warnings[0], /Global setup failed before tests started/);
  const index = await readFile(join(out, 'index.md'), 'utf8');
  assert.match(index, /Global setup failed before tests started/);
  assert.match(index, /No results contained failed Playwright attempts/);
});

test('ignores malformed reporter array elements instead of crashing', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        null,
        {
          suites: [null],
          specs: [
            null,
            {
              file: 'shape.spec.ts',
              title: 'valid failed attempt',
              tests: [
                null,
                {
                  projectName: 'Webkit',
                  results: [null, { retry: 0, status: 'failed', attachments: [null] }],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.equal(manifest.failures.length, 1);
  assert.equal(manifest.failures[0].title, 'valid failed attempt');
  assert.equal(manifest.failures[0].duration, null);
  assert.equal(manifest.failures[0].attachments.length, 0);
  assert.match(await readFile(join(out, 'index.md'), 'utf8'), /\| Duration \| unknown \|/);
});

test('redacts sensitive patterns from copied results, manifest, and index', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      errors: [{ message: 'bearer abcdefghijkl' }],
      suites: [
        {
          specs: [
            {
              file: 'auth.setup.ts',
              title: 'login alice@example.com',
              tests: [
                {
                  projectName: 'setup',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      error: { message: 'Expected alice@example.com to be visible' },
                      attachments: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const manifestJson = await readFile(join(out, 'manifest.json'), 'utf8');
  const index = await readFile(join(out, 'index.md'), 'utf8');
  const copiedResults = await readFile(join(out, 'results.json'), 'utf8');

  assert.equal(manifest.failures[0].error, 'Expected a***@example.com to be visible');
  for (const text of [manifestJson, index, copiedResults]) {
    assert.doesNotMatch(text, /alice@example\.com|abcdefghijkl/);
    assert.match(text, /a\*\*\*@example\.com|\[REDACTED\]/);
  }
});

test('withholds auth setup results and error text without requiring secret env values', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const originalUser = process.env.ORWELLSTAT_USER;
  const originalEmptyUser = process.env.ORWELLSTAT_USER_EMPTY;
  delete process.env.ORWELLSTAT_USER;
  delete process.env.ORWELLSTAT_USER_EMPTY;
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      errors: [{ message: 'Login failed for plain-secret-user' }],
      suites: [
        {
          specs: [
            {
              file: 'auth.setup.ts',
              title: 'authenticate populated account',
              tests: [
                {
                  projectName: 'setup',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      error: { message: 'Expected plain-secret-user to be visible' },
                      attachments: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  try {
    const manifest = await collectFailureEvidence({
      resultsPath: join(source, 'results.json'),
      sourceDir: source,
      outDir: out,
      project: 'setup',
      shard: 'auth-setup',
      totalShards: '1',
      artifactName: 'failure-evidence-auth-setup-webkit',
      withholdSensitiveDetails: true,
      generatedAt: '2026-07-05T12:00:00.000Z',
    });

    assert.equal(manifest.resultsPath, null);
    assert.equal(manifest.failures[0].error, null);
    assert.match(manifest.warnings[0], /withheld/);
    await assert.rejects(readFile(join(out, 'results.json'), 'utf8'));

    const manifestJson = await readFile(join(out, 'manifest.json'), 'utf8');
    const index = await readFile(join(out, 'index.md'), 'utf8');
    for (const text of [manifestJson, index]) {
      assert.doesNotMatch(text, /plain-secret-user/);
      assert.match(text, /withheld/);
    }
  } finally {
    if (originalUser === undefined) delete process.env.ORWELLSTAT_USER;
    else process.env.ORWELLSTAT_USER = originalUser;
    if (originalEmptyUser === undefined) delete process.env.ORWELLSTAT_USER_EMPTY;
    else process.env.ORWELLSTAT_USER_EMPTY = originalEmptyUser;
  }
});

test('withholds sensitive details from any artifact when explicitly requested', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'withheld-attachment');
  await writeFixture(join(attempt, 'console.log'), 'alice@example.com');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      errors: [{ message: 'Login failed for plain-secret-user' }],
      suites: [
        {
          specs: [
            {
              file: 'plain-secret-user.spec.ts',
              title: 'explicit sensitive mode for plain-secret-user',
              tests: [
                {
                  projectName: 'plain-secret-user-project',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      duration: 3210,
                      error: { message: 'Expected plain-secret-user to be visible' },
                      attachments: [
                        {
                          name: 'plain-secret-user console logs',
                          contentType: 'plain-secret-user/content',
                          path: join(attempt, 'console.log'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'setup',
    shard: 'auth-setup',
    totalShards: '1',
    artifactName: 'failure-evidence-webkit-1',
    withholdSensitiveDetails: true,
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.equal(manifest.resultsPath, null);
  const failure = manifest.failures[0];
  assert.equal(failure.attemptId, 'F001-R0');
  assert.equal(failure.specFile, 'withheld');
  assert.equal(failure.line, null);
  assert.equal(failure.title, 'Withheld failure F001-R0');
  assert.equal(failure.projectName, 'withheld');
  assert.equal(failure.duration, null);
  assert.equal(failure.error, null);
  assert.equal(failure.attachments[0].name, 'Attachment 1');
  assert.equal(failure.attachments[0].contentType, null);
  assert.equal(failure.attachments[0].outputPath, 'failures/F001-R0/attachment-01.txt');
  assert.equal(failure.attachments[0].copied, false);
  assert.equal(failure.attachments[0].warning, 'attachment body withheld');
  await assert.rejects(readFile(join(out, 'results.json'), 'utf8'));
  await assert.rejects(readFile(join(out, failure.attachments[0].outputPath), 'utf8'));

  const manifestJson = await readFile(join(out, 'manifest.json'), 'utf8');
  const index = await readFile(join(out, 'index.md'), 'utf8');
  for (const text of [manifestJson, index]) {
    assert.doesNotMatch(text, /plain-secret-user/);
    assert.doesNotMatch(text, /explicit sensitive mode/);
    assert.doesNotMatch(text, /console logs/);
  }
});

test('uses a generic parse warning when sensitive details are withheld', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(join(source, 'results.json'), '{"message":"plain-secret-user"');

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'setup',
    shard: 'auth-setup',
    totalShards: '1',
    artifactName: 'failure-evidence-webkit-1',
    withholdSensitiveDetails: true,
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.resultsPath, null);
  assert.match(manifest.warnings[0], /withheld/);
  assert.match(manifest.warnings[1], /Could not parse results\.json\./);
  assert.doesNotMatch(manifest.warnings.join('\n'), /plain-secret-user|position|Unexpected/);
  await assert.rejects(readFile(join(out, 'results.json'), 'utf8'));
  assert.doesNotMatch(await readFile(join(out, 'index.md'), 'utf8'), /plain-secret-user/);
});

test('does not copy attachment paths outside the source directory', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const outsideAttachment = join(root, 'outside.log');
  await writeFixture(outsideAttachment, 'outside');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'security.spec.ts',
              line: 1,
              title: 'outside attachment path',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: outsideAttachment,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, false);
  assert.equal(attachment.warning, 'attachment path is outside source directory');
  assert.equal(attachment.outputPath, 'failures/F001-R0/console-logs.log');
  await assert.rejects(readFile(join(out, attachment.outputPath), 'utf8'));
});

test('does not copy symlinked attachments that resolve outside the source directory', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'symlink-attempt');
  const outsideAttachment = join(root, 'outside.log');
  const symlinkedAttachment = join(attempt, 'console.log');

  await writeFixture(outsideAttachment, 'outside');
  await mkdir(attempt, { recursive: true });
  await symlink(outsideAttachment, symlinkedAttachment);
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'security.spec.ts',
              line: 1,
              title: 'symlinked outside attachment path',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: symlinkedAttachment,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, false);
  assert.equal(attachment.warning, 'attachment path is outside source directory');
  assert.equal(attachment.outputPath, 'failures/F001-R0/console-logs.log');
  await assert.rejects(readFile(join(out, attachment.outputPath), 'utf8'));
});

test('copies valid attachment paths that contain redaction-shaped segments', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'alice@example.com-attempt');
  await writeFixture(join(attempt, 'console.log'), 'console');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'email-path.spec.ts',
              title: 'email-shaped attachment path',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: join(attempt, 'console.log'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, true);
  assert.equal(attachment.warning, undefined);
  assert.equal(await readFile(join(out, attachment.outputPath), 'utf8'), 'console');
  assert.doesNotMatch(await readFile(join(out, 'manifest.json'), 'utf8'), /alice@example\.com/);
  assert.doesNotMatch(await readFile(join(out, 'results.json'), 'utf8'), /alice@example\.com/);
});

test('redacts text attachment bodies before copying them', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'text-attachment-Webkit');
  await writeFixture(join(attempt, 'console.log'), 'user alice@example.com bearer abcdefghijkl');
  await writeFixture(join(attempt, 'structured'), '{"email":"alice@example.com"}');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'text-attachment.spec.ts',
              title: 'text attachment body',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: join(attempt, 'console.log'),
                        },
                        {
                          name: 'structured',
                          contentType: 'application/json',
                          path: join(attempt, 'structured'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, true);
  const copied = await readFile(join(out, attachment.outputPath), 'utf8');
  assert.equal(copied, 'user a***@example.com bearer [REDACTED]');

  const structured = manifest.failures[0].attachments[1];
  assert.equal(structured.copied, true);
  assert.equal(
    await readFile(join(out, structured.outputPath), 'utf8'),
    '{"email":"a***@example.com"}'
  );
});

test('withholds binary attachment bodies while copying configured-secret-redacted text evidence', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'binary-withheld-Webkit');
  const originalUser = process.env.ORWELLSTAT_USER;
  process.env.ORWELLSTAT_USER = 'plain-secret-user';
  await writeFixture(join(attempt, 'test-failed-1.png'), 'raw screenshot pixels');
  await writeFixture(join(attempt, 'console.log'), 'user plain-secret-user');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'binary-withheld.spec.ts',
              title: 'binary attachment body',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: join('binary-cli-Webkit', 'test-failed-1.png'),
                        },
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: join(attempt, 'console.log'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  try {
    const manifest = await collectFailureEvidence({
      resultsPath: join(source, 'results.json'),
      sourceDir: source,
      outDir: out,
      project: 'Webkit',
      shard: '1',
      totalShards: '2',
      artifactName: 'failure-evidence-webkit-1',
      withholdBinaryAttachments: true,
      redactEnvNames: ['ORWELLSTAT_USER'],
      generatedAt: '2026-07-05T12:00:00.000Z',
    });

    const [screenshot, consoleLog] = manifest.failures[0].attachments;
    assert.equal(screenshot.copied, false);
    assert.equal(screenshot.warning, 'binary attachment body withheld');
    await assert.rejects(readFile(join(out, screenshot.outputPath), 'utf8'));
    assert.equal(consoleLog.copied, true);
    assert.equal(await readFile(join(out, consoleLog.outputPath), 'utf8'), 'user [REDACTED]');
    assert.match(await readFile(join(out, 'index.md'), 'utf8'), /binary attachment body withheld/);
    assert.doesNotMatch(await readFile(join(out, 'manifest.json'), 'utf8'), /plain-secret-user/);
  } finally {
    if (originalUser === undefined) delete process.env.ORWELLSTAT_USER;
    else process.env.ORWELLSTAT_USER = originalUser;
  }
});

test('reports missing attachment files inside the source directory', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'missing-file-Webkit');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'missing-file.spec.ts',
              title: 'missing attachment file',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: join(attempt, 'console.log'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, false);
  assert.equal(attachment.warning, 'attachment file is missing');
  assert.equal(attachment.outputPath, 'failures/F001-R0/console-logs.log');
  await assert.rejects(readFile(join(out, attachment.outputPath), 'utf8'));
  assert.match(await readFile(join(out, 'index.md'), 'utf8'), /attachment file is missing/);
});

test('rejects unexpected filesystem errors while copying attachments', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'directory-attachment-Webkit');
  const directoryAttachment = join(attempt, 'console.log');
  await mkdir(directoryAttachment, { recursive: true });
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'directory-attachment.spec.ts',
              title: 'directory attachment file',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: directoryAttachment,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  await assert.rejects(
    collectFailureEvidence({
      resultsPath: join(source, 'results.json'),
      sourceDir: source,
      outDir: out,
      project: 'Webkit',
      shard: '1',
      totalShards: '2',
      artifactName: 'failure-evidence-webkit-1',
      generatedAt: '2026-07-05T12:00:00.000Z',
    }),
    (error: unknown) => assertFsErrorCode(error, 'EISDIR')
  );
});

test('copies visual snapshot baseline attachments from the project snapshots directory', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const snapshots = join(root, 'tests', 'visual.spec.ts-snapshots');
  const expectedImage = join(snapshots, 'about-page-Webkit-linux.png');
  await writeFixture(expectedImage, 'expected baseline');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'visual.spec.ts',
              line: 98,
              title: 'about page visual regression',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'about-page-expected.png',
                          contentType: 'image/png',
                          path: expectedImage,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, true);
  assert.equal(attachment.warning, undefined);
  assert.equal(attachment.outputPath, 'failures/F001-R0/about-page-expected.png');
  assert.equal(await readFile(join(out, attachment.outputPath), 'utf8'), 'expected baseline');
  assert.match(
    await readFile(join(out, 'index.md'), 'utf8'),
    /\| F001-R0 \| about-page-expected\.png \| failure-evidence-webkit-1 \| failures\/F001-R0\/about-page-expected\.png \|  \|/
  );
});

test('reports attachments with no path without copying a file', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'missing-path.spec.ts',
              title: 'missing attachment path',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const attachment = manifest.failures[0].attachments[0];
  assert.equal(attachment.copied, false);
  assert.equal(attachment.warning, 'attachment has no path');
  assert.equal(attachment.outputPath, 'failures/F001-R0/console-logs.txt');
  const index = await readFile(join(out, 'index.md'), 'utf8');
  assert.match(index, /attachment has no path/);
});

test('renders failed attempts with no attachments explicitly', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'empty-attachments.spec.ts',
              title: 'no attachments',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [{ retry: 0, status: 'failed', attachments: [] }],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.match(
    await readFile(join(out, 'index.md'), 'utf8'),
    /No attachments were listed for Error F001-R0\./
  );
});

test('keeps duplicate attachment names as separate files', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'duplicate-attachments-Webkit');
  await writeFixture(join(attempt, 'first.png'), 'first');
  await writeFixture(join(attempt, 'second.png'), 'second');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'duplicate.spec.ts',
              title: 'duplicate attachment names',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: join(attempt, 'first.png'),
                        },
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: join(attempt, 'second.png'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(
    manifest.failures[0].attachments.map((attachment) => attachment.outputPath),
    ['failures/F001-R0/screenshot.png', 'failures/F001-R0/screenshot-2.png']
  );
  assert.equal(
    await readFile(join(out, manifest.failures[0].attachments[0].outputPath), 'utf8'),
    'first'
  );
  assert.equal(
    await readFile(join(out, manifest.failures[0].attachments[1].outputPath), 'utf8'),
    'second'
  );
});

test('keeps same-title failures in separate error directories', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const firstAttempt = join(source, 'first');
  const secondAttempt = join(source, 'second');
  await writeFixture(join(firstAttempt, 'screenshot.png'), 'first');
  await writeFixture(join(secondAttempt, 'screenshot.png'), 'second');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'collision.spec.ts',
              line: 10,
              title: 'same visible title',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: join(firstAttempt, 'screenshot.png'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              file: 'collision.spec.ts',
              line: 20,
              title: 'same visible title',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: join(secondAttempt, 'screenshot.png'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  const manifest = await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  assert.deepEqual(
    manifest.failures.map((failure) => failure.attemptId),
    ['F001-R0', 'F002-R0']
  );
  assert.equal(await readFile(join(out, 'failures/F001-R0/screenshot.png'), 'utf8'), 'first');
  assert.equal(await readFile(join(out, 'failures/F002-R0/screenshot.png'), 'utf8'), 'second');
});

test('sanitizes markdown-sensitive attachment names in the index', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const out = join(root, 'failure-evidence');
  const attempt = join(source, 'markdown');
  await writeFixture(join(attempt, 'raw.txt'), 'raw');
  await writeFixture(
    join(source, 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'markdown.spec.ts',
              title: 'markdown attachment names',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'bad | name\nwith control\u0000 and Łódź',
                          contentType: 'text/plain',
                          path: join(attempt, 'raw.txt'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );

  await collectFailureEvidence({
    resultsPath: join(source, 'results.json'),
    sourceDir: source,
    outDir: out,
    project: 'Webkit',
    shard: '1',
    totalShards: '2',
    artifactName: 'failure-evidence-webkit-1',
    generatedAt: '2026-07-05T12:00:00.000Z',
  });

  const index = await readFile(join(out, 'index.md'), 'utf8');
  assert.match(index, /bad-name-with-control-and-d.txt/);
  assert.doesNotMatch(index, /bad \| name/);
  assert.doesNotMatch(index, /\u0000/);
});

test('CLI uses default paths and rejects invalid arguments', async () => {
  const root = await makeTempDir();
  await writeFixture(join(root, 'test-results', 'results.json'), '{"suites":[]}\n');
  const script = fileURLToPath(new URL('collect-failure-evidence.ts', import.meta.url));

  const ok = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', script],
    { cwd: root, encoding: 'utf8', timeout: CLI_TIMEOUT_MS }
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(await readFile(join(root, 'failure-evidence', 'index.md'), 'utf8'), /No results/);

  const missingValue = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', script, '--results'],
    { cwd: root, encoding: 'utf8', timeout: CLI_TIMEOUT_MS }
  );
  assert.notEqual(missingValue.status, 0);
  assert.match(missingValue.stderr, /Missing value|expects an argument|argument missing/);
});

test('CLI withholds binary attachments when requested', async () => {
  const root = await makeTempDir();
  const attempt = join(root, 'test-results', 'binary-cli-Webkit');
  await writeFixture(join(attempt, 'test-failed-1.png'), 'raw screenshot pixels');
  await writeFixture(join(attempt, 'console.log'), 'user plain-secret-user');
  await writeFixture(
    join(root, 'test-results', 'results.json'),
    `${JSON.stringify({
      suites: [
        {
          specs: [
            {
              file: 'binary-cli.spec.ts',
              title: 'binary cli attachment',
              tests: [
                {
                  projectName: 'Webkit',
                  results: [
                    {
                      retry: 0,
                      status: 'failed',
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: join('binary-cli-Webkit', 'test-failed-1.png'),
                        },
                        {
                          name: 'console logs',
                          contentType: 'text/plain',
                          path: join('binary-cli-Webkit', 'console.log'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`
  );
  const script = fileURLToPath(new URL('collect-failure-evidence.ts', import.meta.url));

  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      script,
      '--withhold-binary-attachments',
      '--redact-env-names',
      'ORWELLSTAT_USER',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ORWELLSTAT_USER: 'plain-secret-user' },
      timeout: CLI_TIMEOUT_MS,
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const index = await readFile(join(root, 'failure-evidence', 'index.md'), 'utf8');
  assert.match(index, /binary attachment body withheld/);
  assert.equal(
    await readFile(join(root, 'failure-evidence', 'failures/F001-R0/console-logs.log'), 'utf8'),
    'user [REDACTED]'
  );
  assert.doesNotMatch(
    await readFile(join(root, 'failure-evidence', 'manifest.json'), 'utf8'),
    /plain-secret-user/
  );
  await assert.rejects(readFile(join(root, 'failure-evidence', 'failures/F001-R0/screenshot.png')));
});

test('uses GITHUB_RUN_ID when run id is not passed and omits the download command when unset', async () => {
  const root = await makeTempDir();
  const source = join(root, 'test-results');
  const outWithEnv = join(root, 'failure-evidence-env');
  const outWithoutEnv = join(root, 'failure-evidence-no-env');
  const originalRunId = process.env.GITHUB_RUN_ID;
  await writeFixture(join(source, 'results.json'), '{"suites":[]}\n');

  try {
    process.env.GITHUB_RUN_ID = '999999';
    const withEnv = await collectFailureEvidence({
      resultsPath: join(source, 'results.json'),
      sourceDir: source,
      outDir: outWithEnv,
      project: 'Webkit',
      shard: '1',
      totalShards: '2',
      artifactName: 'failure-evidence-webkit-1',
      generatedAt: '2026-07-05T12:00:00.000Z',
    });
    assert.equal(withEnv.runId, '999999');
    assert.match(
      await readFile(join(outWithEnv, 'index.md'), 'utf8'),
      /gh run download 999999 --name failure-evidence-webkit-1/
    );

    delete process.env.GITHUB_RUN_ID;
    const withoutEnv = await collectFailureEvidence({
      resultsPath: join(source, 'results.json'),
      sourceDir: source,
      outDir: outWithoutEnv,
      project: 'Webkit',
      shard: '1',
      totalShards: '2',
      artifactName: 'failure-evidence-webkit-1',
      generatedAt: '2026-07-05T12:00:00.000Z',
    });
    assert.equal(withoutEnv.runId, null);
    assert.match(await readFile(join(outWithoutEnv, 'index.md'), 'utf8'), /not available/);
  } finally {
    if (originalRunId === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = originalRunId;
  }
});
