import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs, stripVTControlCharacters } from 'node:util';
import { redactSensitive } from '../utils/diagnosis.util.ts';

type JsonRecord = Record<string, unknown>;
type RawResult = JsonRecord;
type RawSuite = JsonRecord;
type RawResults = JsonRecord;

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
  status: FailedStatus;
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
  withholdSensitiveDetails?: boolean;
  withholdBinaryAttachments?: boolean;
  redactEnvNames?: string[];
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
  withholdSensitiveDetails: boolean;
  withholdBinaryAttachments: boolean;
  redactor: EvidenceRedactor;
};

type EvidenceRedactor = (value: string) => string;

const FAILED_STATUSES = ['failed', 'timedOut', 'interrupted'] as const;
type FailedStatus = (typeof FAILED_STATUSES)[number];

const FAILED_STATUS_SET = new Set<string>(FAILED_STATUSES);
const MIN_CONFIGURED_SECRET_LENGTH = 3;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(record: JsonRecord, key: string): JsonRecord[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isFailedStatus(value: string): value is FailedStatus {
  return FAILED_STATUS_SET.has(value);
}

function redactConfiguredSecretValues(value: string, secretValues: readonly string[]): string {
  let redacted = value;
  for (const secretValue of secretValues) {
    redacted = redacted.replaceAll(secretValue, '[REDACTED]');
  }
  return redacted;
}

function configuredSecretValues(envNames: readonly string[]): string[] {
  return Array.from(
    new Set(
      envNames
        .map((name) => process.env[name])
        .filter(
          (value): value is string =>
            value !== undefined && value.length >= MIN_CONFIGURED_SECRET_LENGTH
        )
    )
  ).sort((left, right) => right.length - left.length);
}

function createRedactor(envNames: readonly string[] = []): EvidenceRedactor {
  const secretValues = configuredSecretValues(envNames);
  return (value) => redactSensitive(redactConfiguredSecretValues(value, secretValues));
}

function redactEvidenceText(value: string, redactor: EvidenceRedactor): string {
  return redactor(value);
}

function redactJsonValue(value: unknown, redactor: EvidenceRedactor): unknown {
  if (typeof value === 'string') return redactEvidenceText(value, redactor);
  if (Array.isArray(value)) return value.map((nested) => redactJsonValue(nested, redactor));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, redactJsonValue(nested, redactor)])
  );
}

function stripControls(value: string): string {
  return stripVTControlCharacters(value).replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
    ''
  );
}

function cleanText(value: string): string {
  return stripControls(value).replace(/\r\n?/g, '\n').trim();
}

function cleanPublicText(value: string, redactor: EvidenceRedactor): string {
  return cleanText(redactEvidenceText(value, redactor));
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

function withheldAttachmentFileName(index: number, attachment: InternalAttachment): string {
  return `attachment-${String(index + 1).padStart(2, '0')}${extensionFor(attachment.contentType)}`;
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
  if (!isInside(testsRoot, sourcePath)) return false;
  const rel = relative(testsRoot, sourcePath);

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

function isTextAttachment(sourcePath: string, attachment: InternalAttachment): boolean {
  const contentType = attachment.contentType?.toLowerCase().split(';', 1)[0].trim() ?? '';
  if (
    contentType.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/xhtml+xml'].includes(contentType) ||
    contentType.endsWith('+json') ||
    contentType.endsWith('+xml')
  ) {
    return true;
  }
  return ['.html', '.xhtml', '.xml', '.json', '.log', '.md', '.txt'].includes(
    extname(sourcePath).toLowerCase()
  );
}

function errorMessage(result: RawResult, redactor: EvidenceRedactor): string | null {
  const error = isRecord(result.error) ? result.error : null;
  if (typeof error?.message === 'string') return cleanPublicText(error.message, redactor);
  const firstError = recordArray(result, 'errors')[0];
  return typeof firstError?.message === 'string'
    ? cleanPublicText(firstError.message, redactor)
    : null;
}

function attemptId(index: number, retry: number): string {
  return `F${String(index + 1).padStart(3, '0')}-R${retry}`;
}

function publicFailure(
  failure: InternalFailure,
  options: { withholdSensitiveDetails: boolean }
): EvidenceFailure {
  if (options.withholdSensitiveDetails) {
    return {
      attemptId: failure.attemptId,
      specFile: 'withheld',
      line: null,
      title: `Withheld failure ${failure.attemptId}`,
      projectName: 'withheld',
      retry: failure.retry,
      status: failure.status,
      duration: null,
      error: null,
      attachments: failure.attachments.map((attachment, index) => ({
        name: `Attachment ${index + 1}`,
        contentType: null,
        outputPath: attachment.outputPath,
        copied: false,
        ...(attachment.warning === undefined ? {} : { warning: attachment.warning }),
      })),
    };
  }

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

function collectFailures(
  results: RawResults,
  options: { includeErrorMessages: boolean; redactor: EvidenceRedactor }
): InternalFailure[] {
  const failures: InternalFailure[] = [];

  function visitSuite(suite: RawSuite): void {
    for (const nested of recordArray(suite, 'suites')) {
      visitSuite(nested);
    }

    for (const spec of recordArray(suite, 'specs')) {
      const specFile = cleanPublicText(asString(spec.file, 'unknown.spec.ts'), options.redactor);
      const title = cleanPublicText(asString(spec.title, 'untitled test'), options.redactor);
      const line = asNumber(spec.line);

      for (const test of recordArray(spec, 'tests')) {
        const projectName = cleanPublicText(
          asString(test.projectName, 'unknown-project'),
          options.redactor
        );
        for (const result of recordArray(test, 'results')) {
          const status = cleanPublicText(asString(result.status, 'unknown'), options.redactor);
          if (!isFailedStatus(status)) continue;

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
            error: options.includeErrorMessages ? errorMessage(result, options.redactor) : null,
            attachments: recordArray(result, 'attachments').map((attachment) => ({
              name: cleanPublicText(asString(attachment.name, 'attachment'), options.redactor),
              contentType:
                typeof attachment.contentType === 'string'
                  ? cleanText(attachment.contentType)
                  : null,
              sourcePath: typeof attachment.path === 'string' ? attachment.path : null,
              outputPath: '',
              copied: false,
            })),
          });
        }
      }
    }
  }

  for (const suite of recordArray(results, 'suites')) {
    visitSuite(suite);
  }

  return failures;
}

function topLevelErrorWarnings(results: RawResults, redactor: EvidenceRedactor): string[] {
  return recordArray(results, 'errors').map(
    (error) =>
      `Playwright reported top-level error: ${cleanPublicText(
        asString(error.message, 'unknown error'),
        redactor
      )}`
  );
}

async function copyAttachment({
  projectRoot,
  sourceRoot,
  outRoot,
  attachment,
  withholdSensitiveDetails,
  withholdBinaryAttachments,
  redactor,
}: CopyAttachmentContext): Promise<void> {
  const sourcePath = attachmentSourcePath(sourceRoot, attachment);
  if (sourcePath === null) {
    attachment.warning = 'attachment has no path';
    return;
  }

  if (withholdSensitiveDetails) {
    attachment.warning = 'attachment body withheld';
    return;
  }
  if (withholdBinaryAttachments && !isTextAttachment(sourcePath, attachment)) {
    attachment.warning = 'binary attachment body withheld';
    return;
  }

  let canonicalSourcePath: string;
  try {
    canonicalSourcePath = await realpath(sourcePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      attachment.warning = 'attachment file is missing';
      return;
    }
    throw error;
  }

  if (!isAllowedAttachmentSource(projectRoot, sourceRoot, canonicalSourcePath, attachment)) {
    attachment.warning = 'attachment path is outside source directory';
    return;
  }

  const destination = join(outRoot, attachment.outputPath);
  try {
    if (isTextAttachment(canonicalSourcePath, attachment)) {
      await writeFile(
        destination,
        redactEvidenceText(await readFile(canonicalSourcePath, 'utf8'), redactor)
      );
    } else {
      await copyFile(canonicalSourcePath, destination);
    }
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
  try {
    const outStat = await lstat(outDir);
    if (outStat.isSymbolicLink()) {
      throw Object.assign(new Error(`Output directory must not be a symlink: ${outDir}`), {
        code: 'ELOOP',
      });
    }
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
}

function testLocation(failure: EvidenceFailure): string {
  return failure.line === null ? failure.specFile : `${failure.specFile}:${failure.line}`;
}

function attachmentDisplayName(attachment: EvidenceAttachment): string {
  return basename(attachment.outputPath) || sanitizePathComponent(attachment.name, 'attachment');
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

function authSetupWithheldWarning(): string {
  return 'Raw Playwright results and error messages were withheld to avoid exposing sensitive account values.';
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
  await Promise.all([
    writeFile(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(join(outRoot, 'index.md'), renderIndex(manifest)),
  ]);
}

async function writeMissingResultsManifest(
  outRoot: string,
  manifest: EvidenceManifest
): Promise<EvidenceManifest> {
  manifest.warnings.push('No results file was produced.');
  await writeManifest(outRoot, manifest);
  return manifest;
}

export async function collectFailureEvidence(
  options: CollectFailureEvidenceOptions
): Promise<EvidenceManifest> {
  const sourceRoot = resolve(options.sourceDir);
  const projectRoot = dirname(sourceRoot);
  const outRoot = resolve(options.outDir);
  const resultsPath = resolve(options.resultsPath);
  const redactor = createRedactor(options.redactEnvNames);

  await cleanOutput(outRoot);

  const manifest = createEmptyManifest(options);

  let raw: string;
  let canonicalProjectRoot: string;
  let canonicalSourceRoot: string;
  let canonicalResultsPath: string;
  try {
    [canonicalProjectRoot, canonicalSourceRoot, canonicalResultsPath] = await Promise.all([
      realpath(projectRoot),
      realpath(sourceRoot),
      realpath(resultsPath),
    ]);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return writeMissingResultsManifest(outRoot, manifest);
    }
    throw error;
  }

  if (!isInside(canonicalSourceRoot, canonicalResultsPath)) {
    manifest.warnings.push('Results file path is outside source directory.');
    await writeManifest(outRoot, manifest);
    return manifest;
  }

  try {
    raw = await readFile(canonicalResultsPath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return writeMissingResultsManifest(outRoot, manifest);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (options.withholdSensitiveDetails === true) {
      manifest.warnings.push(authSetupWithheldWarning());
      manifest.warnings.push('Could not parse results.json.');
    } else {
      manifest.resultsPath = 'results.json';
      await writeFile(join(outRoot, 'results.json'), redactEvidenceText(raw, redactor));
      const message = error instanceof Error ? error.message : String(error);
      manifest.warnings.push(`Could not parse results.json: ${cleanPublicText(message, redactor)}`);
    }
    await writeManifest(outRoot, manifest);
    return manifest;
  }

  const withholdSensitiveDetails = options.withholdSensitiveDetails === true;
  const withholdBinaryAttachments = options.withholdBinaryAttachments === true;
  if (withholdSensitiveDetails) {
    manifest.warnings.push(authSetupWithheldWarning());
  } else {
    const redactedResults = redactJsonValue(parsed, redactor);
    manifest.resultsPath = 'results.json';
    await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(redactedResults, null, 2)}\n`);
  }

  if (!isRecord(parsed)) {
    manifest.warnings.push('results.json did not contain a Playwright JSON object.');
    await writeManifest(outRoot, manifest);
    return manifest;
  }

  if (withholdSensitiveDetails) {
    if (recordArray(parsed, 'errors').length > 0) {
      manifest.warnings.push(
        'Playwright reported top-level errors, but their messages were withheld.'
      );
    }
  } else {
    manifest.warnings.push(...topLevelErrorWarnings(parsed, redactor));
  }

  const failures = collectFailures(parsed, {
    includeErrorMessages: !withholdSensitiveDetails,
    redactor,
  });
  await Promise.all(
    failures.map(async (failure) => {
      const usedFileNames = new Set<string>();
      for (const [index, attachment] of failure.attachments.entries()) {
        attachment.outputPath = join(
          'failures',
          failure.attemptId,
          uniqueFileName(
            withholdSensitiveDetails
              ? withheldAttachmentFileName(index, attachment)
              : attachmentFileName(attachment),
            usedFileNames
          )
        );
      }
      if (!withholdSensitiveDetails && failure.attachments.length > 0) {
        await mkdir(join(outRoot, 'failures', failure.attemptId), { recursive: true });
      }
      await Promise.all(
        failure.attachments.map((attachment) =>
          copyAttachment({
            projectRoot: canonicalProjectRoot,
            sourceRoot: canonicalSourceRoot,
            outRoot,
            attachment,
            withholdSensitiveDetails,
            withholdBinaryAttachments,
            redactor,
          })
        )
      );
    })
  );

  manifest.failures = failures.map((failure) =>
    publicFailure(failure, { withholdSensitiveDetails })
  );
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
      'withhold-sensitive-details': { type: 'boolean' },
      'withhold-binary-attachments': { type: 'boolean' },
      'redact-env-names': { type: 'string' },
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
    artifactName: values['artifact-name'],
    runId: values['run-id'] ?? process.env.GITHUB_RUN_ID ?? null,
    withholdSensitiveDetails: values['withhold-sensitive-details'] ?? false,
    withholdBinaryAttachments: values['withhold-binary-attachments'] ?? false,
    redactEnvNames: splitList(values['redact-env-names']),
  };
}

function splitList(value: string | undefined): string[] {
  return value === undefined
    ? []
    : value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
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
