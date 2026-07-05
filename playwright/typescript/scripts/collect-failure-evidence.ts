import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';

type RawAttachment = {
  name?: unknown;
  contentType?: unknown;
  path?: unknown;
};

type RawResult = {
  retry?: unknown;
  status?: unknown;
  duration?: unknown;
  error?: { message?: unknown };
  errors?: { message?: unknown }[];
  attachments?: RawAttachment[];
};

type RawTest = {
  projectName?: unknown;
  results?: RawResult[];
};

type RawSpec = {
  file?: unknown;
  line?: unknown;
  title?: unknown;
  tests?: RawTest[];
};

type RawSuite = {
  suites?: RawSuite[];
  specs?: RawSpec[];
};

type RawResults = {
  suites?: RawSuite[];
};

export type EvidenceAttachment = {
  name: string;
  contentType: string | null;
  outputPath: string;
  copied: boolean;
  warning?: string;
};

export type EvidenceFailure = {
  attemptId: string;
  specFile: string;
  line: number | null;
  title: string;
  projectName: string;
  retry: number;
  status: string;
  duration: number | null;
  error: string | null;
  attachments: EvidenceAttachment[];
};

export type EvidenceManifest = {
  generatedAt: string;
  artifactName: string;
  runId: string | null;
  project: string;
  shard: string;
  totalShards: string;
  resultsPath: string | null;
  failures: EvidenceFailure[];
  warnings: string[];
};

export type CollectFailureEvidenceOptions = {
  resultsPath: string;
  sourceDir: string;
  outDir: string;
  project: string;
  shard: string;
  totalShards: string;
  artifactName?: string;
  runId?: string | null;
  generatedAt?: string;
};

type InternalAttachment = EvidenceAttachment & {
  sourcePath: string | null;
};

type InternalFailure = Omit<EvidenceFailure, 'attachments'> & {
  attachments: InternalAttachment[];
};

type CopyAttachmentContext = {
  projectRoot: string;
  sourceRoot: string;
  outRoot: string;
  attachment: InternalAttachment;
};

const FAILED_STATUSES = ['failed', 'timedOut', 'interrupted'] as const;
const FAILED_STATUS_SET = new Set<string>(FAILED_STATUSES);

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function stripControls(value: string): string {
  return stripAnsi(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function cleanText(value: string): string {
  return stripControls(value).replace(/\r\n?/g, '\n').trim();
}

function markdownCell(value: string | number | null): string {
  return cleanText(String(value ?? ''))
    .replace(/\n+/g, '<br>')
    .replace(/\|/g, '\\|');
}

function sanitizePathComponent(value: string, fallback: string): string {
  const safe = cleanText(value)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe.length > 0 ? safe : fallback;
}

function extensionFor(contentType: string | null): string {
  switch (contentType) {
    case 'image/png':
      return '.png';
    case 'video/webm':
      return '.webm';
    case 'application/zip':
      return '.zip';
    case 'text/html':
      return '.html';
    case 'text/markdown':
      return '.md';
    case 'text/plain':
      return '.txt';
    default:
      return '.txt';
  }
}

function attachmentFileName(attachment: InternalAttachment): string {
  const name = sanitizePathComponent(attachment.name, 'attachment');
  const sourcePath = attachment.sourcePath ?? '';
  const sourceExt = extname(sourcePath);
  const ext = sourceExt.length > 0 ? sourceExt : extensionFor(attachment.contentType);
  return ext.length > 0 && name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
}

function uniqueFileName(fileName: string, usedFileNames: Set<string>): string {
  if (!usedFileNames.has(fileName)) {
    usedFileNames.add(fileName);
    return fileName;
  }

  const ext = extname(fileName);
  const base = ext.length > 0 ? fileName.slice(0, -ext.length) : fileName;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}${ext}`;
    if (!usedFileNames.has(candidate)) {
      usedFileNames.add(candidate);
      return candidate;
    }
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

function attachmentSourcePath(sourceRoot: string, attachment: InternalAttachment): string | null {
  if (attachment.sourcePath === null || attachment.sourcePath.length === 0) return null;
  return resolve(
    isAbsolute(attachment.sourcePath)
      ? attachment.sourcePath
      : join(sourceRoot, attachment.sourcePath)
  );
}

function isVisualSnapshotAttachment(
  projectRoot: string,
  sourcePath: string,
  attachment: InternalAttachment
): boolean {
  if (attachment.contentType !== 'image/png') return false;

  const testsRoot = join(projectRoot, 'tests');
  const rel = relative(testsRoot, sourcePath);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) return false;

  return rel.split(/[\\/]/).some((part) => part.endsWith('-snapshots'));
}

function isAllowedAttachmentSource(
  projectRoot: string,
  sourceRoot: string,
  sourcePath: string,
  attachment: InternalAttachment
): boolean {
  return (
    isInside(sourceRoot, sourcePath) ||
    isVisualSnapshotAttachment(projectRoot, sourcePath, attachment)
  );
}

function errorMessage(result: RawResult): string | null {
  if (typeof result.error?.message === 'string') return cleanText(result.error.message);
  const firstError = Array.isArray(result.errors) ? result.errors[0] : undefined;
  return typeof firstError?.message === 'string' ? cleanText(firstError.message) : null;
}

function attemptId(index: number, retry: number): string {
  return `F${String(index + 1).padStart(3, '0')}-R${retry}`;
}

function publicFailure(failure: InternalFailure): EvidenceFailure {
  return {
    ...failure,
    attachments: failure.attachments.map((attachment) => ({
      name: attachment.name,
      contentType: attachment.contentType,
      outputPath: attachment.outputPath,
      copied: attachment.copied,
      ...(attachment.warning === undefined ? {} : { warning: attachment.warning }),
    })),
  };
}

function collectFailures(results: RawResults): InternalFailure[] {
  const failures: InternalFailure[] = [];

  function visitSuite(suite: RawSuite): void {
    for (const nested of Array.isArray(suite.suites) ? suite.suites : []) {
      visitSuite(nested);
    }

    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      const specFile = cleanText(asString(spec.file, 'unknown.spec.ts'));
      const title = cleanText(asString(spec.title, 'untitled test'));
      const line = asNumber(spec.line);

      for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
        const projectName = cleanText(asString(test.projectName, 'unknown-project'));
        for (const result of Array.isArray(test.results) ? test.results : []) {
          const status = cleanText(asString(result.status, 'unknown'));
          if (!FAILED_STATUS_SET.has(status)) continue;

          const retry = asNumber(result.retry) ?? 0;
          failures.push({
            attemptId: attemptId(failures.length, retry),
            specFile,
            line,
            title,
            projectName,
            retry,
            status,
            duration: asNumber(result.duration),
            error: errorMessage(result),
            attachments: (Array.isArray(result.attachments) ? result.attachments : []).map(
              (attachment) => ({
                name: cleanText(asString(attachment.name, 'attachment')),
                contentType:
                  typeof attachment.contentType === 'string'
                    ? cleanText(attachment.contentType)
                    : null,
                sourcePath: typeof attachment.path === 'string' ? attachment.path : null,
                outputPath: '',
                copied: false,
              })
            ),
          });
        }
      }
    }
  }

  for (const suite of Array.isArray(results.suites) ? results.suites : []) {
    visitSuite(suite);
  }

  return failures;
}

async function copyAttachment({
  projectRoot,
  sourceRoot,
  outRoot,
  attachment,
}: CopyAttachmentContext): Promise<void> {
  const sourcePath = attachmentSourcePath(sourceRoot, attachment);
  if (sourcePath === null) {
    attachment.warning = 'attachment has no path';
    return;
  }
  if (!isAllowedAttachmentSource(projectRoot, sourceRoot, sourcePath, attachment)) {
    attachment.warning = 'attachment path is outside source directory';
    return;
  }

  const destination = join(outRoot, attachment.outputPath);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(sourcePath, destination);
    attachment.copied = true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      attachment.warning = 'attachment file is missing';
      return;
    }
    throw error;
  }
}

async function cleanOutput(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    rm(join(outDir, 'failures'), { recursive: true, force: true }),
    rm(join(outDir, 'index.md'), { force: true }),
    rm(join(outDir, 'manifest.json'), { force: true }),
    rm(join(outDir, 'results.json'), { force: true }),
  ]);
}

function testLocation(failure: EvidenceFailure): string {
  return failure.line === null ? failure.specFile : `${failure.specFile}:${failure.line}`;
}

function attachmentDisplayName(attachment: EvidenceAttachment): string {
  return (
    attachment.outputPath.split('/').pop() ?? sanitizePathComponent(attachment.name, 'attachment')
  );
}

function artifactDownloadCommand(manifest: EvidenceManifest): string | null {
  return manifest.runId === null
    ? null
    : `gh run download ${manifest.runId} --name ${manifest.artifactName}`;
}

function renderIndex(manifest: EvidenceManifest): string {
  const lines = [
    '# Playwright Failure Evidence',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Run | ${markdownCell(manifest.runId ?? 'unknown')} |`,
    `| Artifact | ${markdownCell(manifest.artifactName)} |`,
    `| Download command | ${markdownCell(artifactDownloadCommand(manifest) ?? 'not available')} |`,
    `| Project | ${markdownCell(manifest.project)} |`,
    `| Shard | ${markdownCell(`${manifest.shard}/${manifest.totalShards}`)} |`,
    `| Generated | ${markdownCell(manifest.generatedAt)} |`,
    `| Results | ${markdownCell(manifest.resultsPath ?? 'not produced')} |`,
    '',
  ];

  if (manifest.warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const warning of manifest.warnings) lines.push(`- ${markdownCell(warning)}`);
    lines.push('');
  }

  if (manifest.failures.length === 0) {
    lines.push('No results contained failed Playwright attempts.');
    return `${lines.join('\n')}\n`;
  }

  for (const failure of manifest.failures) {
    const duration = failure.duration === null ? 'unknown' : `${failure.duration}ms`;
    lines.push(`## Error ${markdownCell(failure.attemptId)}`, '');
    lines.push('| Field | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Test | ${markdownCell(`${testLocation(failure)} - ${failure.title}`)} |`);
    lines.push(`| Project | ${markdownCell(failure.projectName)} |`);
    lines.push(`| Status | ${markdownCell(failure.status)} |`);
    lines.push(`| Retry | ${markdownCell(failure.retry)} |`);
    lines.push(`| Duration | ${markdownCell(duration)} |`);
    lines.push(`| Artifact to download | ${markdownCell(manifest.artifactName)} |`);
    lines.push(`| Error message | ${markdownCell(failure.error ?? 'not reported')} |`);
    lines.push('');

    if (failure.attachments.length === 0) {
      lines.push(`No attachments were listed for Error ${failure.attemptId}.`, '');
      continue;
    }

    lines.push(`### Attachments for Error ${markdownCell(failure.attemptId)}`, '');
    lines.push('| Error ID | Attachment | Download artifact | Path inside artifact | Note |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const attachment of failure.attachments) {
      lines.push(
        `| ${markdownCell(failure.attemptId)} | ${markdownCell(attachmentDisplayName(attachment))} | ${markdownCell(
          manifest.artifactName
        )} | ${markdownCell(attachment.outputPath)} | ${markdownCell(attachment.warning ?? '')} |`
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function defaultArtifactName(project: string, shard: string): string {
  return `failure-evidence-${sanitizePathComponent(project.toLowerCase(), 'unknown-project')}-${sanitizePathComponent(
    shard,
    '1'
  )}`;
}

function createEmptyManifest(options: CollectFailureEvidenceOptions): EvidenceManifest {
  const artifactName = options.artifactName ?? defaultArtifactName(options.project, options.shard);
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    artifactName,
    runId: options.runId === undefined ? (process.env.GITHUB_RUN_ID ?? null) : options.runId,
    project: options.project,
    shard: options.shard,
    totalShards: options.totalShards,
    resultsPath: null,
    failures: [],
    warnings: [],
  };
}

async function writeManifest(outRoot: string, manifest: EvidenceManifest): Promise<void> {
  await writeFile(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outRoot, 'index.md'), renderIndex(manifest));
}

export async function collectFailureEvidence(
  options: CollectFailureEvidenceOptions
): Promise<EvidenceManifest> {
  const sourceRoot = resolve(options.sourceDir);
  const projectRoot = dirname(sourceRoot);
  const outRoot = resolve(options.outDir);
  const resultsPath = resolve(options.resultsPath);

  await cleanOutput(outRoot);

  const manifest = createEmptyManifest(options);

  let raw: string;
  try {
    raw = await readFile(resultsPath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      manifest.warnings.push('No results file was produced.');
      await writeManifest(outRoot, manifest);
      return manifest;
    }
    throw error;
  }

  manifest.resultsPath = 'results.json';
  await writeFile(join(outRoot, 'results.json'), raw);

  let parsed: RawResults;
  try {
    parsed = JSON.parse(raw) as RawResults;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    manifest.warnings.push(`Could not parse results.json: ${cleanText(message)}`);
    await writeManifest(outRoot, manifest);
    return manifest;
  }

  const failures = collectFailures(parsed);
  await Promise.all(
    failures.map(async (failure) => {
      const usedFileNames = new Set<string>();
      for (const attachment of failure.attachments) {
        attachment.outputPath = join(
          'failures',
          failure.attemptId,
          uniqueFileName(attachmentFileName(attachment), usedFileNames)
        );
      }
      await Promise.all(
        failure.attachments.map((attachment) =>
          copyAttachment({
            projectRoot,
            sourceRoot,
            outRoot,
            attachment,
          })
        )
      );
    })
  );

  manifest.failures = failures.map(publicFailure);
  await writeManifest(outRoot, manifest);
  return manifest;
}

function parseArgs(argv: string[]): CollectFailureEvidenceOptions {
  const { values } = parseNodeArgs({
    args: argv,
    allowPositionals: false,
    options: {
      results: { type: 'string' },
      source: { type: 'string' },
      out: { type: 'string' },
      project: { type: 'string' },
      shard: { type: 'string' },
      'total-shards': { type: 'string' },
      'artifact-name': { type: 'string' },
      'run-id': { type: 'string' },
    },
  });

  const project = values.project ?? 'unknown-project';
  const shard = values.shard ?? '1';

  return {
    resultsPath: values.results ?? 'test-results/results.json',
    sourceDir: values.source ?? 'test-results',
    outDir: values.out ?? 'failure-evidence',
    project,
    shard,
    totalShards: values['total-shards'] ?? '1',
    artifactName: values['artifact-name'] ?? defaultArtifactName(project, shard),
    runId: values['run-id'] ?? process.env.GITHUB_RUN_ID ?? null,
  };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  await collectFailureEvidence(options);
  return 0;
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
