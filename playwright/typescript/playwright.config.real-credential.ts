import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// Hardened config for the single regression test that fills the real
// `ORWELLSTAT_PASSWORD` to reach the server's `new == confirm` branch
// (`tests/zone-admin.spec.ts` → "admin page - password mismatch (real
// credential)"). Trace, screenshot, and video are all turned off so no
// published artefact can capture the form-encoded POST body in cleartext;
// `retries: 0` removes the retry path entirely so a flake cannot turn into
// a trace under any circumstance — see #410.
//
// Trace settings are worker-scoped in Playwright, so they cannot be overridden
// at the describe scope of the standard config (`test.use` rejects them
// per-describe). Isolating into a separate config that targets only this test
// is the only safe way to neutralise the leak.
//
// The companion guard in `zone-admin.spec.ts`
// (`test.skip(process.env.REAL_CREDENTIAL_RUN !== 'true', ...)`) keeps the test
// out of the standard `playwright-typescript.yml` matrix so the real password
// is never filled under the project-wide `trace: 'on-first-retry'` /
// `retries: 2` settings. Only the literal string `'true'` opens the gate —
// `1`, `yes`, etc. are deliberately rejected so the env var must be set
// explicitly.
export default defineConfig({
  ...baseConfig,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  testMatch: /zone-admin\.spec\.ts$/,
  // Tag-based grep: `@real-credential` selects the password-mismatch describe
  // (and only that describe), and `@auth-populated` keeps the populated setup
  // test in scope so the Chromium project's `dependencies: ['setup']` is
  // satisfied and `.auth/populated.json` gets written. The empty setup test
  // (`@auth-empty`) and every other describe in zone-admin.spec.ts are filtered
  // out — they don't need the hardened settings, and running them would only
  // widen the artefact surface.
  grep: /@real-credential|@auth-populated/,
  use: {
    ...baseConfig.use,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  // Single browser project — the mismatch error is server-rendered and
  // browser-agnostic, so the full 5-browser matrix would only multiply the
  // artefact surface for no extra coverage. Filtering preserves each project's
  // existing `use` (devices, storageState) without manual reconstruction; the
  // top-level `use` overrides above propagate via Playwright's project-level
  // inheritance.
  projects: baseConfig.projects?.filter((p) => p.name === 'setup' || p.name === 'Chromium'),
});
