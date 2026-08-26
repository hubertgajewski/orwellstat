import { existsSync } from 'fs';
import { resolve } from 'path';

export function repoRoot(): string {
  return resolve(process.env.REPO_ROOT ?? process.cwd());
}

/**
 * True when running under a CI provider. `CI` is compared explicitly rather than
 * tested for truthiness: `CI=false` is the conventional way to opt out, and the
 * string 'false' is truthy in JavaScript.
 */
function isCi(): boolean {
  const ci = process.env.CI;
  return ci !== undefined && ci !== '' && ci !== 'false';
}

/**
 * Gate for tests that need a built `dist/`. Returns true when the build exists.
 *
 * Locally a missing build warns and returns false, so the caller can skip. In CI
 * the workflow builds each package before running its tests, so a missing build
 * is a defect rather than a valid skip condition and this throws instead —
 * otherwise every gated test would skip under a green job.
 */
export function requireDistBuilt(distIndex: string, label: string): boolean {
  if (existsSync(distIndex)) return true;

  const reason = `${distIndex} is missing. Run \`npm run build\` first.`;
  if (isCi()) {
    throw new Error(`[${label}] Refusing to skip tests in CI: ${reason}`);
  }
  console.warn(`[${label}] Skipping tests: ${reason}`);
  return false;
}

export function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: `ERROR: ${message}` }],
    isError: true,
  };
}
