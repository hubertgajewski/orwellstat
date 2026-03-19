# orwellstat — End-to-End Test Suite

Multi-language, multi-framework end-to-end test suite for [Orwell Stat](https://orwellstat.hubertgajewski.com) — a Polish-language web analytics and statistics service.

## Claude slash commands

Three project-scoped slash commands are available in Claude Code (stored in `.claude/commands/`):

| Command | Usage | What it does |
| --- | --- | --- |
| `/fix-issue` | `/fix-issue <number>` | Fetches the issue and runs the full issue fix workflow from `CLAUDE.md` in order, verifying each step before proceeding |
| `/create-issue` | `/create-issue <description>` | Scaffolds a GitHub issue in the documented format (User Story / Context / AC / Implementation Hint / DoD) and creates it via `gh issue create` |
| `/review` | `/review` | Works through every item on the code review checklist from `CLAUDE.md` and explicitly states a finding (pass / fail / N/A) for each item |

## Repository structure

```
.env                        # credentials (git-ignored); see .env.example
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD, ENV, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD, ANTHROPIC_API_KEY, CLAUDE_DIAGNOSIS
.github/workflows/          # CI workflows (one per sub-project)
SECURITY.md                 # security policy and vulnerability reporting
playwright/
  typescript/               # Playwright tests in TypeScript
selenium/                   # Selenium tests (planned)
bruno/                      # Bruno API request collection
```

## Prerequisites

| Tool                                                              | Required for                   | Install                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18+                               | Playwright tests               | [nodejs.org](https://nodejs.org/)                                                                                |
| [Bruno](https://www.usebruno.com/)                                | API request collection         | Standalone app or [VSCode extension](https://marketplace.visualstudio.com/items?itemName=bruno-api-client.bruno) |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Running GitHub Actions locally | [docker.com](https://www.docker.com/products/docker-desktop/)                                                    |
| [act](https://github.com/nektos/act)                              | Running GitHub Actions locally | macOS: `brew install act` (requires [Homebrew](https://brew.sh)); Linux/Windows 11: [nektos/act releases](https://github.com/nektos/act/releases) |

Node.js includes `npm` — no separate installation needed. Docker and `act` are optional — only needed for local CI testing.

## Credentials

Copy `.env.example` to `.env` at the repo root and fill in your credentials:

```
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
ENV=<production|staging>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
ANTHROPIC_API_KEY=<Anthropic API key>
CLAUDE_DIAGNOSIS=true
```

`ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` are required for all environments. `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are only needed when running against staging — Playwright passes them automatically as HTTP Basic Auth credentials when set. `ANTHROPIC_API_KEY` and `CLAUDE_DIAGNOSIS=true` are both optional — when both are present, failed tests receive an `AI diagnosis` attachment in the Playwright report; when either is absent the fixture behaves identically to without them. In CI, all vars are injected as GitHub Actions secrets. Sub-projects load them via `dotenv` with a path pointing two levels up (`../../.env`).

---

## playwright/typescript

Playwright test suite in TypeScript covering navigation, accessibility, API responses, and page content.

### Setup

```bash
cd playwright/typescript
npm ci
npx playwright install --with-deps
```

### Running tests

```bash
# All tests
npx playwright test

# Single test file
npx playwright test tests/navigation.spec.ts
npx playwright test tests/api.spec.ts
npx playwright test tests/accessibility.spec.ts
npx playwright test tests/home.spec.ts
npx playwright test tests/about-system.spec.ts
npx playwright test tests/contact.spec.ts
npx playwright test tests/statistics.spec.ts
npx playwright test tests/validation.spec.ts
npx playwright test tests/visual.spec.ts
npx playwright test tests/network-mocking.spec.ts

# Specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"

# Single test by name
npx playwright test -g "test name"

# Smoke tests only (HTTP status, titles, heading visibility)
npx playwright test --grep @smoke

# Regression tests only (table content, SVG analysis, link hrefs, accessibility, visual)
npx playwright test --grep @regression

# All tests except smoke (equivalent to regression-only when all tests are tagged)
npx playwright test --grep-invert @smoke

# All tests except regression
npx playwright test --grep-invert @regression

# HTML report
npx playwright show-report

# Interactive UI mode
npx playwright test --ui

# Format with Prettier
npm run format

# Check formatting without writing
npm run format:check
```

### Test tags

Tests are tagged `@smoke` or `@regression` using Playwright's test options syntax (`{ tag: '@smoke' }`).

| Tag           | Purpose                                                                              | Files                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@smoke`      | Quick health check: HTTP status, page titles, heading visibility                     | `api.spec.ts`, `navigation.spec.ts`                                                                                                              |
| `@regression` | Deep checks: table content, SVG analysis, external link hrefs, accessibility, visual | `home.spec.ts`, `about-system.spec.ts`, `contact.spec.ts`, `statistics.spec.ts`, `accessibility.spec.ts`, `validation.spec.ts`, `visual.spec.ts`, `network-mocking.spec.ts` |

Use `--grep` to run a subset and `--grep-invert` to exclude it (see [Running tests](#running-tests)).

### Architecture

**Directory structure** (`playwright/typescript/`):

- `tests/` — Playwright test specs (`.spec.ts`)
  - `navigation.spec.ts` — UI navigation and title tests; tagged `@smoke`
  - `api.spec.ts` — HTTP-level tests for public and authenticated pages; tagged `@smoke`
  - `accessibility.spec.ts` — WCAG accessibility tests across pages; tagged `@regression`
  - `home.spec.ts` — Home page content and navigation tests (including `PreviouslyAddedPage`); tagged `@regression`
  - `about-system.spec.ts` — About System page headings and statsbar content tests; tagged `@regression`
  - `contact.spec.ts` — Contact page headings and statsbar content tests; tagged `@regression`
  - `statistics.spec.ts` — Service statistics page: SVG chart rendering and statistics table tests; tagged `@regression`
  - `validation.spec.ts` — W3C XHTML and CSS validation tests across all pages (classic W3C Markup Validator + CSS validator APIs); Chromium-only; tagged `@regression`
  - `network-mocking.spec.ts` — Network mocking tests using `page.route()`: mocks the SVG chart endpoint with a static response (deterministic render, no animation timing) and mocks the W3C markup validator to return validation errors (negative test for error detection); Chromium-only; tagged `@regression`
  - `visual.spec.ts` — Full-page visual regression snapshots for home (default and Purple Rain style), about system, contact, and statistics pages using `toHaveScreenshot()` with `maxDiffPixelRatio: 0.01`; home page masks `#statsbar` lists (dynamic new-browser/OS list items) via `getByRole('list')`; statistics page masks `getByRole('table')` (live data) and `object[type="image/svg+xml"]` (dynamic SVG chart), removes all but the first 5 rows from the statistics table via `page.evaluate()` to keep the footer at a stable position regardless of how many browser/OS rows live data contains (CSS height/overflow tricks are ineffective here: Playwright's `fullPage` screenshot and mask both use the element's full bounding box, not the clipped visual; physically removing rows is the only reliable fix), waits for `<object>` to be visible before screenshotting to stabilise layout, and disables animations; baselines stored in `tests/visual.spec.ts-snapshots/` with per-platform suffixes (`-darwin`, `-linux`); tagged `@regression`
- `auth.setup.ts` — Playwright auth setup: logs in via UI and saves storage state to `.auth/user.json`
- `pages/` — Page Object Model classes
  - `base.page.ts` — `BasePage` interface (`url`, `title`, `goto()`, `heading`, optional `accessKey`)
  - `abstract.page.ts` — `AbstractPage` abstract class implementing `BasePage` boilerplate; all page classes extend this; defines shared static strings (`signIn`, `loggedInAs`, `logoutButton`)
  - `common.ts` — Shared heading string constants (`NEWS`, `NEW_BROWSERS`, `NEW_OSES`) used by multiple page classes
  - `public/` — Public page classes: `HomePage`, `AboutSystemPage`, `ServiceStatisticsPage`, `ContactPage`, `RegisterPage`, `PasswordResetPage`, `PreviouslyAddedPage`; exported via `index.ts` as `PUBLIC_PAGE_CLASSES` (except `PreviouslyAddedPage`)
  - `authenticated/` — Authenticated page classes: `InformationPage`, `StatsPage`, `HitsPage`, `ScriptsPage`, `AdminPage`; exported via `index.ts` as `AUTHENTICATED_PAGE_CLASSES`
- `fixtures/base.fixture.ts` — Custom Playwright fixture extending `test` with a `page` override that captures browser console logs and an XHTML DOM snapshot (`dom.xhtml` with XML declaration and `<?xml-stylesheet?>` PIs) as attachments on test failure, then calls `attachAiDiagnosis()`; re-exports `expect`, `request`, `Page`, `Locator`, `BrowserContext` from `@playwright/test`; re-exports `pixelmatch` and `PNG` (used for pixel-diff screenshot comparison)
- `fixtures/api.fixture.ts` — Extends `base.fixture.ts` with HTTP request fixtures: `unauthenticatedRequest` (plain context) and `authenticatedRequest` (logs in via POST `/zone/`); import from here in tests that use either fixture
- `utils/accessibility.util.ts` — `expectNoAccessibilityViolations()` using `@axe-core/playwright` (WCAG2AAA)
- `utils/string.util.ts` — `expectHeadings()` helper: asserts visibility of multiple headings on a page
- `utils/validation.util.ts` — `expectValidXhtml(request, xhtml)` POSTs raw markup to the classic W3C Markup Validation Service (`validator.w3.org/check`) and asserts no errors (correct for XHTML 1.0 Strict; Nu is HTML5-only and gives false positives); `expectValidCss(request, cssUrl)` queries W3C CSS validator by URI and asserts zero errors
- `utils/env.util.ts` — `loadEnv(importMetaUrl, levelsUp)` loads `.env` relative to the calling file; `requireCredentials()` validates and returns `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD`, throwing a descriptive error if either is missing
- `utils/diagnosis.util.ts` — `attachAiDiagnosis(testInfo, logs, domContent)`: calls the Anthropic API (`claude-haiku-4-5`) to produce a diagnosis attachment on test failure; no-ops when `ANTHROPIC_API_KEY` or `CLAUDE_DIAGNOSIS=true` are absent; errors are caught and warned so diagnosis never fails a test
- `types/` — Shared TypeScript interfaces; exported via path alias `@types-local/*`
  - `svg-analysis.ts` — `SvgAnalysis` interface: shape of the object returned by `page.evaluate()` in `statistics.spec.ts`
  - `statistics-row.ts` — `StatisticsRow` interface: shape of each data row returned by the bulk `page.evaluate()` in `statistics.spec.ts`
- `test-data/` — Reserved for static test data (currently empty)

**Page Object Model pattern:** Each page class extends `AbstractPage` and defines static `url`, `title` (and optionally `accessKey`) properties used in data-driven loops. The constructor calls `super(page, url, title, accessKey)`. Only the `heading` getter and page-specific static string constants need to be defined per class.

**Soft assertions:** Use `expect.soft()` for independent checks within a test (e.g. link `href` attributes, image `alt` attributes, display text) so all failures are reported in a single run rather than stopping at the first one. Reserve hard `expect()` for critical prerequisites — page navigation, table visibility, row count — where a failure makes subsequent steps meaningless. Tests that mix both follow the pattern: hard assertions first to confirm the page loaded, then soft assertions for each independent property.

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
- `snapshotPathTemplate` includes `{platform}` so macOS (`-darwin`), Linux (`-linux`), and Windows (`-win32`) each have their own baselines; macOS baselines are committed from local runs, Linux baselines are generated via the CI workflow; Windows is not officially supported for local baseline generation — use the CI workflow instead

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master with `working-directory: playwright/typescript`; uses a matrix strategy (`fail-fast: false`) to run each of the 5 browser projects (Chromium, Firefox, Webkit, Mobile Chrome, Mobile Safari) in parallel, each in its own job; each matrix job installs only the browser it needs (`chromium`, `firefox`, or `webkit`) and uploads its report as `playwright-report-<id>` (retained 30 days); npm dependencies are cached via `actions/setup-node` `cache: 'npm'` keyed on `package-lock.json`; upload is skipped when running locally with `act`. Also supports `workflow_dispatch` with three inputs: `project` (choice: `all` / `chromium` / `firefox` / `webkit`; defaults to `all` — a `setup-matrix` job computes the matrix at runtime so only matching browser entries run; selecting `chromium` also runs Mobile Chrome, `webkit` also runs Mobile Safari), `update_visual_baselines` (boolean, regenerates Linux baselines for all 5 browser projects via `--update-snapshots` — each matrix job uploads `visual-baselines-linux-<id>` and the `commit-baselines` job downloads all five with `merge-multiple: true` before committing), and `ref` (branch to run on; defaults to triggering branch). To generate Linux baselines for a feature branch: Actions → "Playwright Typescript Tests" → "Run workflow" → enter the branch name in `ref`, check `update_visual_baselines`.

**Standalone baseline update:** `.github/workflows/update-visual-baselines.yml` — `workflow_dispatch`-only workflow that regenerates Linux baselines for all 5 browser projects and commits them back directly; accepts a `branch` input (defaults to `main`). Use this when you want to regenerate baselines without running the full test suite.

**Automated code review:** `.github/workflows/claude-code-review.yml` — triggers on pull request events (opened, synchronize, ready_for_review, reopened); runs `anthropics/claude-code-action@v1` (model: `claude-sonnet-4-6`) to review the PR and post inline comments; focuses on Playwright test correctness, POM conventions, TypeScript quality, and consistency; requires `ANTHROPIC_API_KEY` secret.

---

## bruno

Bruno API request collection for manual and automated HTTP testing.

### Setup

Open the `bruno/` directory in the Bruno standalone app or use the Bruno VSCode extension.

Copy `bruno/.env.example` to `bruno/.env` (git-ignored) and fill in the values:

```
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
```

> `bruno/.env` must be at the collection root — Bruno CLI reads secrets from there, not from `environments/`.

### Environments

| Environment | Base URL                                      |
| ----------- | --------------------------------------------- |
| production  | `https://orwellstat.hubertgajewski.com`       |
| staging     | `https://stage.orwellstat.hubertgajewski.com` |

> Staging requires HTTP Basic authentication (`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`) in addition to the application login.

### CLI

Run from the `bruno/` directory:

```bash
npm ci                        # install Bruno CLI (first time or after lockfile changes)
npx bru run --env production
npx bru run --env staging
```

### Variable syntax

In `.bru` files:

- Template variables (request body, URL): `{{process.env.VAR_NAME}}` for dotenv secrets; `{{varName}}` for `vars {}` block values
- Pre-request scripts: `bru.getProcessEnv('VAR_NAME')` for dotenv secrets; `bru.getEnvVar('VAR_NAME')` for `vars`/`vars:secret` values

### Requests

| File                | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `login-valid.bru`   | POST `/zone/` with valid credentials — expects 200   |
| `login-invalid.bru` | POST `/zone/` with invalid credentials — expects 401 |

**CI:** `.github/workflows/bruno.yml` — runs on push/PR to main/master; writes secrets into `bruno/.env` and runs `bru run --env production`.

---

## Running GitHub Actions locally

Use [`act`](https://github.com/nektos/act) to run workflows locally before pushing.

> **Note:** The commands in this section were verified on macOS only. Linux and Windows 11 equivalents are provided as a best-effort guide and may require adjustments.

### Requirements

- **Docker Desktop** — must be running ([docker.com](https://www.docker.com/products/docker-desktop/))
- **act**
  - macOS: requires [Homebrew](https://brew.sh), then `brew install act`
  - Linux: run the official install script (`curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash`), or download a binary from [nektos/act releases](https://github.com/nektos/act/releases) and add it to `PATH`
  - Windows 11: `winget install nektos.act` (winget is included with Windows 11)

### Usage

```bash
# Run the default push trigger
act push --container-architecture linux/amd64

# Run a specific workflow
act push -W .github/workflows/playwright-typescript.yml --container-architecture linux/amd64
act push -W .github/workflows/bruno.yml --container-architecture linux/amd64
```

On first run, `act` will ask for a Docker image size — choose **Medium** (~500MB). The Playwright workflow installs browsers via `npx playwright install --with-deps`; the Bruno workflow only needs Node and `npm ci`.

> **Note (macOS Apple Silicon):** The `--container-architecture linux/amd64` flag is required on Apple Silicon (M-series) Macs to avoid compatibility issues. Linux and Windows 11 users running on x86-64 hardware can omit this flag.

> **Credentials:** The repo root contains `.actrc` which automatically passes `--secret-file .env` to every `act` invocation. `ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` from `.env` are loaded as secrets with no extra flags needed.

### Docker RAM requirements for the Playwright matrix

The matrix strategy runs 5 browser projects in parallel, each in its own container. Every container installs Chromium (required by the auth setup project) plus its own browser:

| Job | Browsers installed | RAM |
|---|---|---|
| Chromium | chromium | ~1.0 GB |
| Mobile Chrome | chromium | ~1.0 GB |
| Firefox | chromium + firefox | ~1.4 GB |
| WebKit | chromium + webkit | ~1.2 GB |
| Mobile Safari | chromium + webkit | ~1.2 GB |
| **Total** | | **~5.8 GB active + ~2 GB Docker overhead** |

**8 GB Docker RAM (default) — run a single browser only**

With the default Docker Desktop memory limit (~8 GB), running all 5 matrix jobs simultaneously causes container OOM kills. Run Chromium only:

```bash
act push -W .github/workflows/playwright-typescript.yml --matrix id:chromium --container-architecture linux/amd64
```

**16 GB+ Docker RAM — full matrix run**

With 16 GB allocated to Docker, all 5 browser containers fit in memory and can run in parallel, matching CI exactly:

```bash
act push -W .github/workflows/playwright-typescript.yml --container-architecture linux/amd64
```

**macOS** — quit Docker Desktop first, then run (requires `jq` — `brew install jq`, which itself requires [Homebrew](https://brew.sh)):

```bash
jq '.MemoryMiB = 16384' \
  ~/Library/Group\ Containers/group.com.docker/settings-store.json \
  > /tmp/docker-settings.json \
  && mv /tmp/docker-settings.json \
     ~/Library/Group\ Containers/group.com.docker/settings-store.json
```

**Linux** — Docker Engine on Linux does not impose a separate memory limit; containers share the host's available RAM directly. Ensure your system has at least 16 GB of physical RAM to run the full matrix.

**Windows 11** — quit Docker Desktop first, then run in PowerShell:

```powershell
$path = "$env:APPDATA\Docker\settings-store.json"
$s = Get-Content $path | ConvertFrom-Json
$s.memoryMiB = 16384
$s | ConvertTo-Json -Depth 10 | Set-Content $path
```

Then restart Docker Desktop and verify on any platform with:

```bash
docker info --format '{{.MemTotal}}' | awk '{printf "%.0f GB\n", $1/1073741824}'
```
