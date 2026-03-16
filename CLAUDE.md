# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep this file and `README.md` up to date.** Whenever the project structure changes — new directories, renamed files, new sub-projects, changed commands, updated CI, modified environment variables — update the relevant sections of both files before finishing the task.

For a full project overview, setup instructions, and commands see [README.md](README.md).

---

## Repository structure

```
.env                        # credentials (git-ignored); see .env.example
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD, ENV, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD
.github/workflows/          # CI workflows (one per sub-project)
SECURITY.md                 # security policy and vulnerability reporting
playwright/
  typescript/               # Playwright tests in TypeScript
selenium/                   # Selenium tests (planned)
bruno/                      # Bruno API request collection; package.json locks @usebruno/cli version
```

## Environment variables

Credentials are stored in `.env` at the **repo root** and shared across all sub-projects:

```
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
ENV=<production|staging>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
```

`ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` are required for all environments. `ENV` selects the target environment for Playwright — accepted values are `production` (default) and `staging`; omitting it defaults to `production`. `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are only needed for staging — Playwright passes them as HTTP Basic Auth credentials when set. In CI all vars are injected as GitHub Actions secrets. Sub-projects load them via `dotenv` with a path pointing two levels up (`../../.env`).

---

## playwright/typescript

All commands must be run from `playwright/typescript/`.

### Architecture

**Directory structure** (`playwright/typescript/`):

- `tests/` — Playwright test specs (`.spec.ts`)
  - `navigation.spec.ts` — UI navigation and accessibility tests
  - `api.spec.ts` — HTTP-level tests for public and authenticated pages
  - `accessibility.spec.ts` — WCAG accessibility tests across pages
  - `home.spec.ts` — Home page content and navigation tests (including `PreviouslyAddedPage`)
  - `about-system.spec.ts` — About System page headings and statsbar content tests
  - `contact.spec.ts` — Contact page headings and statsbar content tests
  - `statistics.spec.ts` — Service statistics page: SVG chart rendering and statistics table tests
  - `validation.spec.ts` — W3C XHTML and CSS validation tests across all pages (classic W3C Markup Validator + CSS validator APIs); Chromium-only
  - `visual.spec.ts` — Full-page visual regression snapshots for home (default and Purple Rain style), about system, contact, and statistics pages using `toHaveScreenshot()` with `maxDiffPixelRatio: 0.01`; home page masks `#statsbar > .text > ul` (dynamic new-browser/OS list items); statistics page masks `table` (live data) and disables animations; baselines stored in `tests/visual.spec.ts-snapshots/`
- `auth.setup.ts` — Playwright auth setup: logs in via UI and saves storage state to `.auth/user.json`
- `pages/` — Page Object Model classes
  - `base.page.ts` — `BasePage` interface (`url`, `title`, `goto()`, `heading`, optional `accessKey`)
  - `abstract.page.ts` — `AbstractPage` abstract class implementing `BasePage` boilerplate; all page classes extend this; defines shared static strings (`signIn`, `loggedInAs`, `logoutButton`)
  - `common.ts` — Shared heading string constants (`NEWS`, `NEW_BROWSERS`, `NEW_OSES`) used by multiple page classes
  - `public/` — Public page classes: `HomePage`, `AboutSystemPage`, `ServiceStatisticsPage`, `ContactPage`, `RegisterPage`, `PasswordResetPage`, `PreviouslyAddedPage`; exported via `index.ts` as `PUBLIC_PAGE_CLASSES` (except `PreviouslyAddedPage`)
  - `authenticated/` — Authenticated page classes: `InformationPage`, `StatsPage`, `HitsPage`, `ScriptsPage`, `AdminPage`; exported via `index.ts` as `AUTHENTICATED_PAGE_CLASSES`
- `fixtures/base.fixture.ts` — Custom Playwright fixture extending `test` with:
  - `authenticatedRequest` — logs in via POST `/zone/` before each test
  - Captures browser console logs and XHTML DOM snapshot (`dom.xhtml` with XML declaration and `<?xml-stylesheet?>` PIs) as attachments on test failure
  - Re-exports `expect`, `request`, `Page`, `Locator`, `BrowserContext` from `@playwright/test`
  - Re-exports `pixelmatch` and `PNG` (used for pixel-diff screenshot comparison)
- `utils/accessibility.util.ts` — `expectNoAccessibilityViolations()` using `@axe-core/playwright` (WCAG2AAA)
- `utils/string.util.ts` — `expectHeadings()` helper: asserts visibility of multiple headings on a page
- `utils/env.util.ts` — `loadEnv(importMetaUrl, levelsUp)` loads `.env` relative to the calling file; `requireCredentials()` validates and returns `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD`, throwing a descriptive error if either is missing
- `utils/validation.util.ts` — `expectValidXhtml(request, xhtml)` POSTs raw markup to the classic W3C Markup Validation Service (`validator.w3.org/check`) and asserts no errors (correct for XHTML 1.0 Strict; Nu is HTML5-only and gives false positives); `expectValidCss(request, cssUrl)` queries W3C CSS validator by URI and asserts zero errors
- `types/` — Shared TypeScript interfaces; exported via path alias `@types-local/*`
  - `svg-analysis.ts` — `SvgAnalysis` interface: shape of the object returned by `page.evaluate()` in `statistics.spec.ts`
  - `statistics-row.ts` — `StatisticsRow` interface: shape of each data row returned by the bulk `page.evaluate()` in `statistics.spec.ts`
- `test-data/` — Reserved for static test data (currently empty)

**Page Object Model pattern:** Each page class extends `AbstractPage` and defines static `url`, `title` (and optionally `accessKey`) properties used in data-driven loops. The constructor calls `super(page, url, title, accessKey)`. Only the `heading` getter and page-specific static string constants need to be defined per class.

**Path aliases** (defined in `tsconfig.json`):

- `@fixtures/*` → `./fixtures/*`
- `@pages/*` → `./pages/*`
- `@test-data/*` → `./test-data/*`
- `@types-local/*` → `./types/*`
- `@utils/*` → `./utils/*`

**Playwright config** (`playwright.config.ts`):

- 5 browser projects: Chromium, Firefox, WebKit, Mobile Chrome (Galaxy S24), Mobile Safari (iPhone 15)
- All projects use `storageState: '.auth/user.json'` (written by `auth.setup.ts`)
- On failure: screenshots, video, and console/DOM log attachments are saved
- `trace: 'on-first-retry'`
- `baseURL` is driven by the `ENV` variable (`production` by default, `staging` when `ENV=staging`); `httpCredentials` are injected automatically when `BASIC_AUTH_USER` is set
- `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01 }` — global threshold for visual regression tests
- `snapshotPathTemplate` omits the OS platform token so baselines generated on macOS work on Linux CI within the 1% tolerance

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master with `working-directory: playwright/typescript`; uploads `playwright/typescript/playwright-report/` as an artifact (retained 30 days); upload is skipped when running locally with `act`.

---

## Code review checklist

Before committing changes to `playwright/typescript`, review against these criteria:

- **Playwright test correctness** — selectors use `getByRole()` / `getByText()` with `exact: true`; no CSS class selectors; no `waitForTimeout()`; count asserted before `.nth()`; no `.first()` silencing missing elements; assertions are specific and meaningful (not just `toBeTruthy()`)
- **Fixture usage** — custom fixtures from `base.fixture.ts` used where appropriate; `authenticatedRequest` used for authenticated API tests; no manual login logic duplicated outside `auth.setup.ts`; imports come from `@fixtures/base.fixture` (not directly from `@playwright/test`)
- **Page Object Model conventions** — page classes extend `AbstractPage`; `heading` getter uses `getByRole('heading', { name: ..., exact: true })`; static `url`, `title`, `accessKey` defined; no page-specific logic leaking into test files
- **TypeScript quality** — no `!` non-null assertions on env vars; `page.evaluate()` calls have explicit generic type; no implicit `any`; no unused imports; path aliases used instead of relative imports (`@fixtures/*`, `@pages/*`, `@utils/*`, `@test-data/*`, `@types-local/*`); `tsc --noEmit` passes
- **Potential bugs** — async/await not missing on Playwright calls; no unhandled promise rejections; locators not reused across navigations; any file reading `process.env` credentials calls `loadEnv(import.meta.url, N)` at module top level (missing this passes on CI but fails locally)
- **Flakiness** — no fixed timeouts; animation waits use `requestAnimationFrame`; auth setup asserts login actually succeeded; no assumptions about element order without explicit count assertion
- **Security** — no credentials hardcoded anywhere; `.env` and `bruno/.env` remain gitignored; Bruno dotenv secrets accessed via `{{process.env.VAR}}` / `bru.getProcessEnv()` (not plaintext in `.bru` files); no sensitive data in committed config files (`.actrc`, `playwright.config.ts`, etc.); `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD` sourced only from `.env` (local) or GitHub Actions secrets (CI)
- **Formatting** — code is formatted with Prettier (`npm run format` from `playwright/typescript/`); never commit files that would fail `npm run format:check`
- **Consistency with existing patterns** — new utils and test files documented in **both** `CLAUDE.md` and `README.md` (both files have mirrored architecture sections); new page files exported via the appropriate `index.ts`; code style matches surrounding files; JSON/config files are valid (no stray braces, no syntax errors)

---

## GitHub issue format

When creating GitHub issues for requirements, bugs, or code review findings, use this structure:

**Title:** `[label] Short imperative description`

**Body sections (in order):**

1. **User Story** — "As a tester, I want ... so that ..."
2. **Context** — explanation of the current problem with exact file references
3. **Acceptance Criteria** — Given/When/Then scenarios covering the happy path and the failure case
4. **Implementation Hint** — concrete code snippet showing the fix
5. **Definition of Done** — checklist of observable, verifiable outcomes

**Labels:** apply semantic labels such as `test-quality`, `flakiness`, `type-safety`, `pom`.

---

## Issue fix workflow

When fixing a GitHub issue, follow these steps in order:

1. Make the code change
2. Run `tsc --noEmit` — must pass with no errors
3. Run `npm run format` — auto-formats all files; no manual style fixes needed
4. Review against the [code review checklist](#code-review-checklist)
5. Run the affected test(s) — must pass
6. Create a branch from remote `main` named `feature/<issue-number>` or `bugfix/<issue-number>` (e.g. `feature/19`)
7. **Review the diff as a fresh reviewer** — run `git diff` (staged + unstaged) and treat every changed file as unfamiliar code. Work through the checklist below and **explicitly state each finding** (even if the finding is "no issues"). Saying "the diff looks clean" without articulating the checks performed is not acceptable.

   **General checks (every diff):**
   - Every non-obvious change: *"Would I understand why this was done just from the diff?"* If no, add a code comment or adjust the implementation.
   - No credentials, tokens, or secrets in committed files.
   - No dead code, commented-out blocks, or debug artifacts left in.
   - Docs updated: if a file documented in `CLAUDE.md` or `README.md` changed, verify both files reflect the change.

   **CI / workflow files (`.github/workflows/*.yml`):**
   - `timeout-minutes` set at the job level — no job should run unbounded.
   - All `actions/*` pinned to a specific major version (e.g. `@v4`); third-party actions pinned to a full SHA.
   - `node-version: lts/*` is acceptable for Node setup; npm package versions must be pinned in `package.json` + `package-lock.json` (use `npm ci`, not `npm install -g @package`).
   - No env vars copied blindly from another workflow without verifying they apply — each env var must have a reason visible in the file or a comment.
   - Secrets written to disk (e.g. `echo "KEY=${{ secrets.KEY }}" >> .env`) must be scoped to the minimum needed and never logged.
   - Steps that only make sense in specific contexts (e.g. artifact upload skipped under `act`) must have an `if:` condition with a clear comment explaining the guard.
8. **Verify all acceptance criteria and the Definition of Done** — read every Given/When/Then scenario and every DoD checkbox in the issue. For each item, explicitly confirm it is satisfied or identify what is missing. Do not proceed to commit until all criteria pass.
9. Commit with a **short, single-line message** in the format `<issue-number> <short description>` (e.g. `19 Add explicit SvgAnalysis type to page.evaluate()`). No body, no `Co-Authored-By` trailer — single line only.
10. Push and create a PR — include `Closes #<issue-number>` in the PR body so GitHub links and auto-closes the issue on merge

---

## bruno

Bruno API request collection in `bruno/`. Environments are in `bruno/environments/` — `production.bru` and `staging.bru`.

**Secrets** go in `bruno/.env` at the collection root (git-ignored via the top-level `.env` pattern). Copy `bruno/.env.example` to `bruno/.env` and fill in the values. This file must be at the collection root — Bruno CLI does not read from `environments/.env`.

**CLI usage** (run from `bruno/`):
```bash
npm ci                        # install Bruno CLI (first time or after package-lock.json changes)
npx bru run --env production
npx bru run --env staging
```

**Variable syntax in `.bru` files:**
- Template variables (request body, URL): `{{process.env.VAR_NAME}}` for dotenv secrets; `{{varName}}` for `vars {}` block values
- Pre-request scripts: `bru.getProcessEnv('VAR_NAME')` for dotenv secrets; `bru.getEnvVar('VAR_NAME')` for `vars`/`vars:secret` values

Staging requires HTTP Basic authentication (`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`) in addition to the application login.

**CI:** `.github/workflows/bruno.yml` — runs on push/PR to main/master; writes `ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` from GitHub Actions secrets into `bruno/.env` and runs `bru run --env production`.
