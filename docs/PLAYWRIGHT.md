# Playwright Test Suite

The TypeScript Playwright suite lives under [`playwright/typescript/`](../playwright/typescript). It covers public pages, authenticated pages, API status, accessibility, XHTML/CSS validation, visual regression, forms, tracking snippets, and coverage-matrix drift.

## Setup

```bash
cd playwright/typescript
npm ci
npx playwright install --with-deps
```

`npm ci` triggers the `prepare` script, which wires the local Husky pre-commit hook.

## Pre-Commit Hook

[`playwright/typescript/.husky/pre-commit`](../playwright/typescript/.husky/pre-commit) runs on local commits:

1. `lint-staged` formats staged `*.{ts,tsx,js,json,md,yml,yaml,html,xhtml}` files under `playwright/typescript/` with Prettier and re-stages them.
2. `npx tsc --noEmit` blocks commits with TypeScript errors.

`git commit --no-verify` bypasses the local hook, but CI still runs the same backstop checks. Claude/Codex assistant hooks also run the TypeScript and format checks before direct `git push` publication commands; see [CI.md](CI.md#assistant-publish-gate).

## Running Tests

Run from `playwright/typescript/`:

```bash
# All tests
npx playwright test

# Single test file
npx playwright test tests/navigation.spec.ts
npx playwright test tests/zone-admin.spec.ts

# Specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"

# Single test by title
npx playwright test -g "test name"

# Smoke tests only
npx playwright test --grep @smoke

# Regression tests only
npx playwright test --grep @regression

# HTML report
npx playwright show-report

# Interactive UI mode
npx playwright test --ui

# Format and check
npm run format
npm run format:check

# TypeScript and unit tests
npm run tsc
npm run test:unit

# Coverage-matrix drift check
npm run verify:matrix
```

Remote XHTML/CSS validation is off by default. The default path uses local `xmllint` for XHTML and local `csstree-validator` for CSS, so authenticated HTML does not leave the runner.

```bash
VALIDATE_REMOTE=true npx playwright test tests/validation.spec.ts
```

Use `VALIDATE_REMOTE=true` sparingly; it posts XHTML to `validator.w3.org/check` and sends CSS URIs to `jigsaw.w3.org/css-validator`.

To inspect flaky tests across CI runs, download blob artifacts and merge them:

```bash
gh run list --workflow=playwright-typescript.yml --limit 10 --json databaseId \
  --jq '.[].databaseId' | \
  xargs -I{} sh -c 'gh run download {} --pattern "blob-report-*" --dir ./blobs/{} 2>/dev/null || true'

npx playwright merge-reports --reporter=html ./blobs/*/blob-report-*
```

## Test Tags

Tests use Playwright's tag option syntax. Every ordinary test or enclosing `test.describe` carries exactly one category tag. Scope tags can be added for workflow selectors.

| Tag                | Kind     | Purpose                                                                                       | Files                               |
| ------------------ | -------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `@smoke`           | category | Fast health checks: HTTP status, titles, heading visibility                                   | `api.spec.ts`, `navigation.spec.ts` |
| `@regression`      | category | Deep checks: content, SVG analysis, links, accessibility, validation, visual, forms, tracking | Most spec files under `tests/`      |
| `@real-credential` | scope    | Selects the single password-mismatch test that fills the real password                        | `zone-admin.spec.ts`                |
| `@auth-populated`  | scope    | Selects populated-account auth setup; included by real-credential workflow dependencies       | `auth.setup.ts`                     |
| `@auth-empty`      | scope    | Selects empty-account auth setup; currently not grep-included by a workflow                   | `auth.setup.ts`                     |

Use `--grep` to include a tag and `--grep-invert` to exclude one.

## Directory Structure

```text
playwright/typescript/
  auth.setup.ts                  # logs in populated and empty accounts
  coverage-matrix.json           # manual page/form coverage matrix
  fixtures/                      # custom Playwright fixtures and storage-state constants
  pages/                         # Page Object Model classes
  scripts/                       # matrix verifier, failure-evidence collector, and redaction CLI
  test-data/                     # tracking snippet fixtures
  tests/                         # Playwright spec files
  types/                         # local TypeScript interfaces
  utils/                         # shared helpers and node:test unit suites
  playwright.config.ts           # main Playwright config
  playwright.config.real-credential.ts
  tsconfig.json
```

For what each spec covers, see [TEST_INVENTORY.md](TEST_INVENTORY.md).

## Authentication And Storage State

`auth.setup.ts` logs in as both accounts and writes:

- `.auth/populated.json`
- `.auth/empty.json`
- `.auth/metadata.json`

The setup project runs sequentially to avoid back-to-back login throttling. After login, it asserts that the rendered username matches the credential pair it just used, so swapped populated/empty credentials fail early. Metadata contains the generation timestamp, GitHub run identifiers, and storage-state labels only; it must not contain usernames, cookies, or credentials.

CI test shards download the auth-state artifact and validate that all three files exist and that metadata is fresh before running with `--no-deps`. If a failed-job rerun reuses stale artifacts, the reusable test job reruns the setup project locally before starting the shard.

Browser projects default to `storageState: '.auth/populated.json'`. Empty-state specs opt in per file:

```typescript
test.use({ storageState: EMPTY_STORAGE_STATE });
```

`authenticatedRequest` inherits the populated storage state. Use `unauthenticatedRequest` for unauthenticated API calls. Do not branch at runtime on which account is logged in.

## Page Object Model Pattern

Each page class extends `AbstractPage` and defines static `url`, `title`, and optional `accessKey` properties used by data-driven tests. The constructor calls:

```typescript
super(page, url, title, accessKey);
```

Each page class defines a `heading` getter and page-specific static string constants. Shared heading strings live in `pages/common.ts`.

Public page classes live under `pages/public/`; authenticated page classes live under `pages/authenticated/`. Their `index.ts` files export the page lists used by data-driven suites.

## Fixtures And Utilities

| Path                                  | Purpose                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures/base.fixture.ts`            | Extends Playwright `test`, captures console logs and `dom.xhtml` on failure, attaches AI diagnosis when enabled, and re-exports common Playwright types  |
| `fixtures/api.fixture.ts`             | Adds `unauthenticatedRequest` and `authenticatedRequest` API fixtures                                                                                    |
| `fixtures/storage-state.ts`           | Exports populated and empty storage-state paths                                                                                                          |
| `utils/accessibility.util.ts`         | Axe WCAG checks                                                                                                                                          |
| `utils/string.util.ts`                | Heading visibility helper                                                                                                                                |
| `utils/svg-chart.util.ts`             | SVG chart loading, parsing, and chart/table comparison helpers                                                                                           |
| `utils/svg-chart-table.util.ts`       | Fixture-free XHTML snapshot table extractor                                                                                                              |
| `utils/svg-chart-percent.util.ts`     | Percentage normalization and chart/table tolerance helpers                                                                                               |
| `utils/validation.util.ts`            | XHTML and CSS validators with local and remote modes                                                                                                     |
| `utils/track-hit.util.ts`             | Tracking-hit seeding through live snippets and `/scripts/drain.php`                                                                                      |
| `utils/env.util.ts`                   | `.env` loading and credential validation                                                                                                                 |
| `utils/auth-state-metadata.util.ts`   | Non-secret `.auth/metadata.json` writer for CI auth-state freshness checks                                                                               |
| `utils/diagnosis.util.ts`             | AI diagnosis, selector-fix attachment, and redaction rules                                                                                               |
| `utils/css-validator.util.ts`         | Pure helpers around `csstree-validator`                                                                                                                  |
| `scripts/collect-failure-evidence.ts` | Builds CI `failure-evidence-*` artifacts with an indexed `index.md`, `manifest.json`, `results.json`, and failed-attempt attachments grouped by error id |
| `scripts/verify-coverage-matrix.ts`   | Cross-checks active tests against `coverage-matrix.json`                                                                                                 |
| `scripts/redact.ts`                   | stdin/stdout redaction CLI used by self-healing                                                                                                          |
| `test-data/scripts/snippet-*.txt`     | Canonical HTML5, HTML4, and XHTML tracking snippets with `{{ORWELLSTAT_BASE}}` placeholders                                                              |
| `test-data/scripts/tracking-*`        | HTML/HTML4/XHTML shells used by tracking E2E tests after inserting the matching live snippet                                                             |

Unit tests for pure utilities run through `npm run test:unit`.

## Soft Assertions

Use `expect.soft()` for independent checks so a single run reports every text, link, or image mismatch. Use hard `expect()` for prerequisites where continuing would be meaningless, such as page navigation, table visibility, and row counts.

## Path Aliases

Defined in `tsconfig.json`:

- `@fixtures/*` -> `./fixtures/*`
- `@pages/*` -> `./pages/*`
- `@test-data/*` -> `./test-data/*`
- `@types-local/*` -> `./types/*`
- `@utils/*` -> `./utils/*`

## Playwright Config

`playwright.config.ts` defines five browser projects:

- Chromium
- Firefox
- WebKit
- Mobile Chrome (Galaxy S24)
- Mobile Safari (iPhone 15)

Important defaults:

- Failure artifacts: screenshots, video, console log, `dom.xhtml`, and optional AI diagnosis. CI failed shards upload `failure-evidence-<id>-<shard>` artifacts that index those files with traces, error context, selector-fix notes, and `results.json` when Playwright produced them. Failed auth setup legs upload `failure-evidence-auth-setup-<id>` with trace, screenshot, and video capture disabled. The evidence index gives each failed attempt an error id and shows the artifact name plus the path inside that artifact for every attachment.
- `trace: 'on-first-retry'`.
- `baseURL` from `ENV` (`production` by default, `staging` when `ENV=staging`).
- `httpCredentials` injected automatically when `BASIC_AUTH_USER` is set.
- `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01 }`.
- `snapshotPathTemplate` includes `{platform}` so macOS, Linux, and Windows baselines stay separate.

Linux baselines are generated by CI. Windows is not officially supported for local baseline generation; use the CI workflow.

Each Playwright minor bump ships new Chromium/WebKit/Firefox builds. Expect sub-pixel baseline drift and refresh Linux snapshots via `update-visual-baselines.yml` before merging dependency PRs that change `@playwright/test`.
