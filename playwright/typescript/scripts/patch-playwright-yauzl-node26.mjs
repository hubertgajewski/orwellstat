import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightCorePackagePath =
  process.env.PATCH_PLAYWRIGHT_YAUZL_PACKAGE_JSON ??
  require.resolve('playwright-core/package.json');
const playwrightCoreDirectory = path.dirname(playwrightCorePackagePath);
const playwrightCorePackage = JSON.parse(fs.readFileSync(playwrightCorePackagePath, 'utf8'));
const zipBundlePath = path.join(playwrightCoreDirectory, 'lib', 'zipBundleImpl.js');

if (playwrightCorePackage.version !== '1.59.1') {
  console.log(
    `Skipping Playwright yauzl Node 26 patch for playwright-core ${playwrightCorePackage.version}.`
  );
  process.exit(0);
}

const fdSlicerStartMarker = 'me.inherits(xe,zr);';
const fdSlicerEndMarker = 'me.inherits(D,pe);';
const readStreamDestroyOld =
  'xe.prototype.destroy=function(e){this.destroyed||(e=e||new Error("stream destroyed"),this.destroyed=!0,this.emit("error",e),this.context.unref())};';
const readStreamDestroyNew =
  'xe.prototype.destroy=function(e){return e==null&&!this.readableEnded&&(e=new Error("stream destroyed")),zr.prototype.destroy.call(this,e)};xe.prototype._destroy=function(e,r){this._destroyed||(this._destroyed=!0,this.context.unref()),r(e)};';
const writeStreamDestroyOld =
  'Ee.prototype.destroy=function(){this.destroyed||(this.destroyed=!0,this.context.unref())};';
const writeStreamDestroyNew =
  'Ee.prototype._destroy=function(e,r){this._destroyed||(this._destroyed=!0,this.context.unref()),r(e)};';

const bundle = fs.readFileSync(zipBundlePath, 'utf8');

if (bundle.includes(readStreamDestroyNew) && bundle.includes(writeStreamDestroyNew)) {
  console.log('Playwright yauzl Node 26 patch already applied.');
  process.exit(0);
}

const fdSlicerStart = bundle.indexOf(fdSlicerStartMarker);
const fdSlicerEnd = bundle.indexOf(fdSlicerEndMarker);

if (fdSlicerStart === -1 || fdSlicerEnd === -1 || fdSlicerEnd <= fdSlicerStart) {
  throw new Error(`Could not find fd-slicer section in ${zipBundlePath}.`);
}

let fdSlicerSection = bundle.slice(fdSlicerStart, fdSlicerEnd);

for (const target of [readStreamDestroyOld, writeStreamDestroyOld]) {
  if (!fdSlicerSection.includes(target)) {
    throw new Error(`Could not find expected Playwright yauzl patch target in ${zipBundlePath}.`);
  }
}

fdSlicerSection = fdSlicerSection
  .replaceAll('.destroyed', '._destroyed')
  .replace(readStreamDestroyOld.replaceAll('.destroyed', '._destroyed'), readStreamDestroyNew)
  .replace(writeStreamDestroyOld.replaceAll('.destroyed', '._destroyed'), writeStreamDestroyNew);

fs.writeFileSync(
  zipBundlePath,
  bundle.slice(0, fdSlicerStart) + fdSlicerSection + bundle.slice(fdSlicerEnd)
);
console.log('Applied Playwright yauzl Node 26 patch.');
