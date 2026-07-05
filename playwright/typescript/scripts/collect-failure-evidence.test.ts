import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFailureEvidence } from './collect-failure-evidence.ts';

const tempDirs: string[] = [];

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

  const manifestJson = JSON.parse(
    await readFile(join(out, 'manifest.json'), 'utf8')
  ) as typeof manifest;
  assert.equal(manifestJson.artifactName, 'failure-evidence-webkit-1');
  assert.equal(manifestJson.runId, '28742473811');
  assert.equal(manifestJson.project, 'Webkit');
  assert.equal(manifestJson.shard, '1');
  assert.equal(manifestJson.totalShards, '2');
  assert.equal(manifestJson.resultsPath, 'results.json');
  assert.equal(manifestJson.failures.length, 2);
  assert.equal(manifestJson.failures[0].attemptId, 'F001-R0');
  assert.equal(manifestJson.failures[0].error, 'Test timeout of 30000ms exceeded.');
  assert.equal('sourcePath' in manifestJson.failures[0].attachments[0], false);
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
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(await readFile(join(root, 'failure-evidence', 'index.md'), 'utf8'), /No results/);

  const missingValue = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', script, '--results'],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(missingValue.status, 0);
  assert.match(missingValue.stderr, /Missing value|expects an argument|argument missing/);
});
