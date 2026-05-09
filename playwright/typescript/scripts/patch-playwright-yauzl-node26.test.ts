import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'patch-playwright-yauzl-node26.mjs'
);
const READ_STREAM_DESTROY_OLD =
  'xe.prototype.destroy=function(e){this.destroyed||(e=e||new Error("stream destroyed"),this.destroyed=!0,this.emit("error",e),this.context.unref())};';
const WRITE_STREAM_DESTROY_OLD =
  'Ee.prototype.destroy=function(){this.destroyed||(this.destroyed=!0,this.context.unref())};';

function validBundle(): string {
  return [
    'before;',
    'me.inherits(xe,zr);',
    READ_STREAM_DESTROY_OLD,
    WRITE_STREAM_DESTROY_OLD,
    'me.inherits(D,pe);',
    'after;',
  ].join('');
}

function createPlaywrightCoreFixture(version = '1.59.1', bundle = validBundle()) {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'playwright-yauzl-patch-'));
  const packageJsonPath = join(root, 'package.json');
  const bundlePath = join(root, 'lib', 'zipBundleImpl.js');

  fs.mkdirSync(dirname(bundlePath), { recursive: true });
  fs.writeFileSync(packageJsonPath, JSON.stringify({ version }));
  fs.writeFileSync(bundlePath, bundle);

  return { root, packageJsonPath, bundlePath };
}

function runPatch(packageJsonPath: string): string {
  return execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATCH_PLAYWRIGHT_YAUZL_PACKAGE_JSON: packageJsonPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runPostinstallPatch(): string {
  const env = { ...process.env };
  delete env.PATCH_PLAYWRIGHT_YAUZL_PACKAGE_JSON;

  return execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runPatchFailure(packageJsonPath: string): string {
  let thrown: unknown;

  try {
    runPatch(packageJsonPath);
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);

  const processError = thrown as Error & { stderr?: Buffer; stdout?: Buffer };

  return `${processError.stdout?.toString() ?? ''}${processError.stderr?.toString() ?? ''}`;
}

test('patches a Playwright 1.59.1 zip extractor fixture', (t) => {
  const fixture = createPlaywrightCoreFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const output = runPatch(fixture.packageJsonPath);

  assert.match(output, /Applied Playwright yauzl Node 26 patch\./);

  const bundle = fs.readFileSync(fixture.bundlePath, 'utf8');

  assert.ok(
    bundle.includes('zr.prototype.destroy.call(this,e)'),
    'read stream destroy delegates to the Node stream implementation'
  );
  assert.ok(
    bundle.includes(
      'xe.prototype._destroy=function(e,r){this._destroyed||(this._destroyed=!0,this.context.unref()),r(e)};'
    ),
    'read stream implements _destroy'
  );
  assert.ok(
    bundle.includes(
      'Ee.prototype._destroy=function(e,r){this._destroyed||(this._destroyed=!0,this.context.unref()),r(e)};'
    ),
    'write stream implements _destroy'
  );
});

test('is idempotent when the Playwright bundle is already patched', (t) => {
  const fixture = createPlaywrightCoreFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  runPatch(fixture.packageJsonPath);

  assert.match(
    runPatch(fixture.packageJsonPath),
    /Playwright yauzl Node 26 patch already applied\./
  );
});

test('uses installed playwright-core when no test fixture package path is provided', () => {
  assert.match(runPostinstallPatch(), /Playwright yauzl Node 26 patch already applied\./);
});

test('skips Playwright versions that do not need this 1.59.1 patch', (t) => {
  const fixture = createPlaywrightCoreFixture('1.60.0');
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const before = fs.readFileSync(fixture.bundlePath, 'utf8');

  assert.match(
    runPatch(fixture.packageJsonPath),
    /Skipping Playwright yauzl Node 26 patch for playwright-core 1.60.0\./
  );
  assert.equal(fs.readFileSync(fixture.bundlePath, 'utf8'), before);
});

test('fails when fd-slicer markers are reversed', (t) => {
  const fixture = createPlaywrightCoreFixture(
    '1.59.1',
    'me.inherits(D,pe);middle;me.inherits(xe,zr);'
  );
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  assert.match(
    runPatchFailure(fixture.packageJsonPath),
    /Could not find fd-slicer section in .*zipBundleImpl\.js/
  );
});

test('fails when the expected Playwright patch target is missing', (t) => {
  const fixture = createPlaywrightCoreFixture(
    '1.59.1',
    validBundle().replace(WRITE_STREAM_DESTROY_OLD, '')
  );
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  assert.match(
    runPatchFailure(fixture.packageJsonPath),
    /Could not find expected Playwright yauzl patch target in .*zipBundleImpl\.js/
  );
});
