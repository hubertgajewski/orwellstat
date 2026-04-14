# orwellstat — End-to-End Test Suite

Multi-language, multi-framework end-to-end test suite for [Orwell Stat](https://orwellstat.hubertgajewski.com) — a Polish-language web analytics and statistics service.

## Claude skills

Four project-scoped skills are available in Claude Code (stored in `.claude/skills/`) and appear in the VSCode extension `/` menu:

| Skill              | Usage                         | What it does                                                                                                                                                                                                       |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/fix-issue`       | `/fix-issue <number>`         | Fixes a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR                                                                                                                             |
| `/create-issue`    | `/create-issue <description>` | Scaffolds a GitHub issue in the documented format (User Story / Context / AC / Implementation Hint / DoD / milestone) and creates it via `gh issue create`                                                         |
| `/code-review`     | `/code-review`                | Works through every item on the code review checklist from `.claude/skills/code-review/SKILL.md`, applies general diff checks and CI workflow checks, and explicitly states a finding (pass / fail / N/A) for each item |
| `/generate-stubs`  | `/generate-stubs`             | Reads `coverage-matrix.json`, finds uncovered page-category combinations (excluding `title` and `api`), and generates `test.fixme()` stubs in the appropriate spec files                                           |

## Repository structure

```
.env                        # credentials (git-ignored); see .env.example
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD, ENV, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
.vars                       # CI repository variables (git-ignored); see .vars.example
.vars.example               # template: AI_REVIEW, PLAYWRIGHT_TYPESCRIPT, BRUNO, QUALITY_METRICS, AI_DIAGNOSIS, AI_PROVIDER, AI_MODEL_FAST, AI_MODEL_STRONG, AI_REVIEW_PROVIDER, AI_REVIEW_MODEL, SELF_HEALING
.mcp.json                   # MCP server definitions (MCP_DOCKER, playwright, playwright-report-mcp, quality-metrics) — loaded by Claude Code and other MCP-compatible AI assistants
.github/workflows/          # CI workflows (one per sub-project)
CLAUDE.md                   # repository-specific behavioral guidance for Claude Code
CODEX.md                    # Codex entrypoint; delegates shared repository guidance to CLAUDE.md
GEMINI.md                   # Gemini entrypoint; delegates shared repository guidance to CLAUDE.md
QUALITY_METRICS.md          # auto-generated quality metrics report (escape rate, MTTR, coverage, trends)
SECURITY.md                 # security policy and vulnerability reporting
quality-metrics-history.json  # historical quality metrics data points (auto-committed by workflow)
scripts/
  generate-quality-metrics.py  # generates QUALITY_METRICS.md and updates quality-metrics-history.json
  self-healing.py              # self-healing selector fix: parses test artifacts, posts PR comments or creates draft PRs
  test_self_healing.py         # unit tests for self-healing.py (all loop prevention and classification scenarios)
  setup-runners.sh             # registers and starts 8 self-hosted runner instances as launchd services
playwright/
  typescript/               # Playwright tests in TypeScript
selenium/                   # Selenium tests (planned)
bruno/                      # Bruno API request collection
mcp/
  quality-metrics/          # local MCP server exposing escape rate, MTTR, and metrics history
```

## Prerequisites

| Tool                                                              | Required for                   | Install                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18+                               | Playwright tests               | [nodejs.org](https://nodejs.org/)                                                                                                                 |
| [Bruno](https://www.usebruno.com/)                                | API request collection         | Standalone app or [VSCode extension](https://marketplace.visualstudio.com/items?itemName=bruno-api-client.bruno)                                  |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Running GitHub Actions locally | [docker.com](https://www.docker.com/products/docker-desktop/)                                                                                     |
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
GEMINI_API_KEY=<Gemini API key>
OPENROUTER_API_KEY=<OpenRouter API key (required when AI_REVIEW_PROVIDER=openrouter)>
```

`ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` are required for all environments. `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are only needed when running against staging — Playwright passes them automatically as HTTP Basic Auth credentials when set. `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` are optional — when the active provider's key is present alongside `AI_DIAGNOSIS=true` in `.vars`, failed tests receive an `AI diagnosis` attachment in the Playwright report; when either is absent the fixture behaves identically to without them. Set `AI_PROVIDER` in `.vars` to choose the provider (`anthropic` by default, or `gemini`). `OPENROUTER_API_KEY` is required when `AI_REVIEW_PROVIDER=openrouter` (the default for the PR reviewer); get one at https://openrouter.ai/keys. In CI, secrets are injected as GitHub Actions secrets and variables via GitHub Actions variables. Sub-projects load them via `dotenv` with a path pointing two levels up (`../../.env` and `../../.vars`).

### CI repository variables

The following variables are set in **GitHub → Settings → Variables → Actions** (not secrets, not `.env`). Locally they live in `.vars` (loaded by Playwright via dotenv and by `act` via `--var-file`). Most are opt-in gates: set to exactly `true` to enable; when absent or any other value the feature or workflow job is skipped. Exception: `workflow_dispatch` runs always bypass the approval gate and run tests regardless of the variable value. `RUNNER` is not a boolean gate — set it to `self-hosted` to route all non-dispatch jobs to the local runner, or leave it unset to use `ubuntu-latest`.

| Variable                | Purpose                                      | When it applies                                                            |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `AI_DIAGNOSIS`          | AI-powered test failure diagnosis attachment | Every Playwright run (local and CI)                                        |
| `AI_PROVIDER`           | AI provider for diagnosis (`anthropic` or `gemini`; default: `anthropic`) | Every Playwright run (local and CI)           |
| `AI_MODEL_FAST`         | Override fast-tier model (diagnosis); empty = provider default            | Every Playwright run (local and CI)           |
| `AI_MODEL_STRONG`       | Override strong-tier model (selector fix); empty = provider default       | Every Playwright run (local and CI)           |
| `AI_REVIEW_PROVIDER`    | Provider for PR reviewer (`openrouter` default or `anthropic`)            | PR events via `claude-code-review.yml`                                     |
| `AI_REVIEW_MODEL`       | Override reviewer model; empty = provider default (openrouter: `qwen/qwen3.6-plus`, anthropic: `claude-sonnet-4-6`) | PR events via `claude-code-review.yml`                                     |
| `AI_REVIEW`             | `claude-code-review.yml`                     | PR events (opened, synchronize, ready_for_review, reopened)                |
| `PLAYWRIGHT_TYPESCRIPT` | `playwright-typescript.yml`                  | PR events, push to main, Sunday 03:00 UTC schedule, `workflow_dispatch`    |
| `BRUNO`                 | `bruno.yml`                                  | PR events, push to main, `workflow_dispatch`                               |
| `QUALITY_METRICS`       | `quality-metrics.yml`                        | 1st of every month 06:00 UTC schedule, `workflow_dispatch`                 |
| `SELF_HEALING`          | `self-healing.yml`                           | After any failed Playwright Typescript Tests workflow run                  |
| `RUNNER`                | Default runner for all workflow jobs         | Push, PR, schedule, `workflow_dispatch` (dispatch dropdown overrides this) |

## Getting started

After cloning the repo and filling in `.env`, run the setup step:

```bash
# Playwright tests
cd playwright/typescript && npm ci && npx playwright install --with-deps && cd ../..
```

Then open your AI assistant from the **repo root** so `.mcp.json` is picked up and all MCP server tools are available.

## Adapting to your own environment

This repository is specific to Orwell Stat out of the box, but it can be adapted with moderate effort to a simple or moderately complex web application with similar page-driven flows. It is not intended as a drop-in framework for large, highly dynamic, or deeply domain-specific products.

### What you will need to change first

1. Base URLs

Update the target environments in [playwright.config.ts](./playwright/typescript/playwright.config.ts) and the Bruno environment files:

- [playwright.config.ts](./playwright/typescript/playwright.config.ts) — replace the `BASE_URLS` values
- [production.bru](./bruno/environments/production.bru) — replace `baseUrl`
- [staging.bru](./bruno/environments/staging.bru) — replace `baseUrl`

2. Authentication flow

If your app logs in differently, update:

- [auth.setup.ts](./playwright/typescript/auth.setup.ts) — UI login flow and post-login assertion
- [api.fixture.ts](./playwright/typescript/fixtures/api.fixture.ts) — API login request used by authenticated HTTP tests
- [.env.example](./.env.example) — rename or replace credential variables if your app uses different secrets

If your app does not require authentication, you can remove the authenticated fixtures, the setup project, and any tests that depend on `storageState`.

3. Page objects and routes

The fastest migration path is to keep the current Page Object Model structure and replace Orwell Stat pages one by one:

- [public index](./playwright/typescript/pages/public/index.ts) — defines the public page list used by data-driven tests
- [authenticated index](./playwright/typescript/pages/authenticated/index.ts) — defines the authenticated page list
- files under [playwright/typescript/pages/public](./playwright/typescript/pages/public)
- files under [playwright/typescript/pages/authenticated](./playwright/typescript/pages/authenticated)

For each page class, update:

- `url`
- `title`
- `heading`
- page-specific locators and text constants

4. Assertions tied to Orwell Stat content

Most adaptation work is in the spec files, because many assertions check Orwell Stat-specific headings, links, tables, and chart behavior:

- [tests/home.spec.ts](./playwright/typescript/tests/home.spec.ts)
- [tests/about-system.spec.ts](./playwright/typescript/tests/about-system.spec.ts)
- [tests/contact.spec.ts](./playwright/typescript/tests/contact.spec.ts)
- [tests/statistics.spec.ts](./playwright/typescript/tests/statistics.spec.ts)
- [tests/visual.spec.ts](./playwright/typescript/tests/visual.spec.ts)
- [tests/validation.spec.ts](./playwright/typescript/tests/validation.spec.ts)

The lowest-friction way to migrate is:

1. Make `api.spec.ts` and `navigation.spec.ts` pass first.
2. Update page objects until the smoke suite is green.
3. Port deeper regression tests page by page.
4. Regenerate visual baselines only after layout and selectors are stable.

5. Coverage matrix

Update [coverage-matrix.json](./playwright/typescript/coverage-matrix.json) so it reflects your pages and forms; otherwise the coverage workflow will report misleading results.

### Features you may want to disable during migration

These are useful for Orwell Stat, but optional for a fork:

- AI diagnosis in [diagnosis.util.ts](./playwright/typescript/utils/diagnosis.util.ts) if you do not want failed DOM snapshots sent to an external AI provider
- visual regression snapshots in [tests/visual.spec.ts](./playwright/typescript/tests/visual.spec.ts) until your UI is stable
- W3C validation checks in [tests/validation.spec.ts](./playwright/typescript/tests/validation.spec.ts) if your app is not XHTML/CSS-validator oriented
- self-hosted runner automation in [setup-runners.sh](./scripts/setup-runners.sh) if you do not need push-back workflows
- quality metrics and issue-label reporting if your repo does not use the same bug taxonomy

### Workflow adjustments usually needed in a fork

If you adapt this repository to another project, review the GitHub Actions files before relying on them unchanged.

The most common adjustments are:

- repository identity guards in files under [.github/workflows](./.github/workflows), such as `github.repository == 'hubertgajewski/orwellstat'`
- secret names and repository variables if your environment does not use `ORWELLSTAT_*`, `BASIC_AUTH_*`, `PLAYWRIGHT_TYPESCRIPT`, `BRUNO`, or `QUALITY_METRICS`
- push-back workflows that commit generated files or visual baselines back to the repository
- self-hosted runner configuration in [setup-runners.sh](./scripts/setup-runners.sh), which is currently hardcoded to this GitHub repository
- optional AI integrations such as AI diagnosis (Anthropic or Gemini) and PR review if you do not want external AI services in your pipeline

Review these files first:

- [playwright-typescript.yml](./.github/workflows/playwright-typescript.yml)
- [bruno.yml](./.github/workflows/bruno.yml)
- [quality-metrics.yml](./.github/workflows/quality-metrics.yml)
- [update-visual-baselines.yml](./.github/workflows/update-visual-baselines.yml)
- [claude-code-review.yml](./.github/workflows/claude-code-review.yml)
- [setup-runners.sh](./scripts/setup-runners.sh)

### Recommended migration order

1. Replace base URLs and credentials.
2. Make the login flow work in `auth.setup.ts`.
3. Replace page classes and page lists.
4. Get smoke tests passing.
5. Port API, accessibility, and regression assertions.
6. Update `coverage-matrix.json`.
7. Adjust GitHub Actions secrets, variables, repository guards, and optional workflows.
8. Re-record visual baselines.

### Reusable parts of this repo

The most reusable pieces are:

- Playwright project structure and POM conventions
- failure attachments and debugging fixtures
- data-driven page loops from `PUBLIC_PAGE_CLASSES` / `AUTHENTICATED_PAGE_CLASSES`
- accessibility checks with Axe
- CI workflow structure for browser matrix runs
- Bruno collection layout for simple authenticated API checks

The least reusable parts are the exact selectors, copy, URLs, visual baselines, and assumptions about a relatively straightforward page structure.

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

# Detect flaky tests by merging blob reports from multiple CI runs
# 1. Download blob artifacts for the last N runs (adjust --limit as needed)
gh run list --workflow=playwright-typescript.yml --limit 10 --json databaseId \
  --jq '.[].databaseId' | \
  xargs -I{} sh -c 'gh run download {} --pattern "blob-report-*" --dir ./blobs/{} 2>/dev/null || true'
# 2. Merge all blobs into a single HTML report — flaky tests appear in a dedicated section
npx playwright merge-reports --reporter=html ./blobs/*/blob-report-*

# Interactive UI mode
npx playwright test --ui

# Format with Prettier
npm run format

# Check formatting without writing
npm run format:check
```

### Test tags

Tests are tagged `@smoke` or `@regression` using Playwright's test options syntax (`{ tag: '@smoke' }`).

| Tag           | Purpose                                                                              | Files                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@smoke`      | Quick health check: HTTP status, page titles, heading visibility                     | `api.spec.ts`, `navigation.spec.ts`                                                                                                                                         |
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
- `utils/diagnosis.util.ts` — `attachAiDiagnosis(testInfo, logs, domContent)`: calls the configured AI provider (Anthropic or Gemini, selected by `AI_PROVIDER`) to produce a diagnosis and optional selector-fix attachment on test failure; model names default to a per-provider map but can be overridden via `AI_MODEL_FAST` (diagnosis) and `AI_MODEL_STRONG` (selector fix); no-ops when `AI_DIAGNOSIS=true` is absent or the provider's API key is missing; errors are caught and warned so diagnosis never fails a test
- `types/` — Shared TypeScript interfaces; exported via path alias `@types-local/*`
  - `svg-analysis.ts` — `SvgAnalysis` interface: shape of the object returned by `page.evaluate()` in `statistics.spec.ts`
  - `statistics-row.ts` — `StatisticsRow` interface: shape of each data row returned by the bulk `page.evaluate()` in `statistics.spec.ts`
- `test-data/` — Reserved for static test data (currently empty)
- `coverage-matrix.json` — Manual test coverage matrix: lists all known testable pages and forms with boolean flags per category (title, content, accessibility, visualRegression, api); updated by hand when new tests are added or new pages/forms are introduced to the application; read by the Test Coverage Trends workflow to calculate and display coverage percentages

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

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master and on `pull_request_review` (submitted/dismissed) with `working-directory: playwright/typescript`; a `check-approval` pre-check job queries the GitHub API for at least one `APPROVED` review before allowing test jobs to run — push, schedule, and `workflow_dispatch` events bypass the gate automatically; uses a matrix strategy (`fail-fast: false`) to run each of the 5 browser projects (Chromium, Firefox, Webkit, Mobile Chrome, Mobile Safari) in parallel, each in its own job; each matrix job installs only the browser it needs (`chromium`, `firefox`, or `webkit`) and uploads its HTML report as `playwright-report-<id>` and its blob report as `blob-report-<id>` (both retained 30 days); blob reports can be merged with `npx playwright merge-reports` to identify flaky tests across runs (see [Running tests](#running-tests)); npm dependencies are cached via `actions/setup-node` `cache: 'npm'` keyed on `package-lock.json`; upload is skipped when running locally with `act`. Also supports `workflow_dispatch` with four inputs: `project` (choice: `all` / `chromium` / `firefox` / `webkit`; defaults to `all` — a `setup-matrix` job computes the matrix at runtime so only matching browser entries run; selecting `chromium` also runs Mobile Chrome, `webkit` also runs Mobile Safari), `update_visual_baselines` (boolean, regenerates Linux baselines for all 5 browser projects via `--update-snapshots` — each matrix job uploads `visual-baselines-linux-<id>` and the `commit-baselines` job downloads all five with `merge-multiple: true` before committing), `ref` (branch to run on; defaults to triggering branch), and `runner` (free-text override — leave empty to use the `RUNNER` repo variable; push/PR/schedule always use `vars.RUNNER` or fall back to `ubuntu-latest`). To generate Linux baselines for a feature branch: Actions → "Playwright Typescript Tests" → "Run workflow" → enter the branch name in `ref`, check `update_visual_baselines`.

**Standalone baseline update:** `.github/workflows/update-visual-baselines.yml` — `workflow_dispatch`-only workflow that regenerates Linux baselines for all 5 browser projects and commits them back directly; accepts a `branch` input (defaults to `main`) and a `runner` text input (leave empty to use `vars.RUNNER`). Always dispatch against a feature branch (not `main`) — `GITHUB_TOKEN` can push to unprotected branches, so the updated snapshots land on your branch and the open PR picks them up automatically. Use this when you want to regenerate baselines without running the full test suite.

**Automated code review:** `.github/workflows/claude-code-review.yml` — triggers on pull request events (opened, synchronize, ready_for_review, reopened); runs `anthropics/claude-code-action@v1` (model: `claude-sonnet-4-6`) to review the PR and submit a formal GitHub review via `gh pr review` (Approved / Changes Requested / Commented), making the bot appear in the PR Reviewers section with a status badge; uses inline comments for specific code issues; focuses on Playwright test correctness, POM conventions, TypeScript quality, and consistency; requires `ANTHROPIC_API_KEY` secret.

**Test Coverage Trends:** `.github/workflows/test-coverage.yml` — runs on push to main when `coverage-matrix.json` or any file under `tests/` changes, and on `workflow_dispatch`; reads `playwright/typescript/coverage-matrix.json` and outputs a coverage percentage table to the GitHub Actions step summary. Coverage is measured as a **manual matrix** — not code coverage — because there is no access to the backend source. The matrix lists all known testable items (pages × categories: title, content, accessibility, visualRegression, api; plus interactive forms) and each entry is a boolean reflecting whether a spec currently exercises that combination. When a new test covers a previously uncovered item, flip the value in `coverage-matrix.json` from `false` to `true`; the next workflow run will show the improved percentage. When a new page or form is added to the application, add a new entry to the matrix so it appears as a gap (all `false`) until tests are written.

**Quality Metrics Dashboard:** `.github/workflows/quality-metrics.yml` — runs on schedule (1st of every month at 6 AM UTC) and on `workflow_dispatch` (with a `runner` text input — leave empty to use `vars.RUNNER`); queries all issues labeled `bug` to calculate two metrics and writes them to the GitHub Actions step summary:

- **Defect escape rate** = `found-in-production / (found-by-test + found-by-manual-testing + found-in-production)` — measures how effective testing is at catching bugs before users hit them.
- **MTTR (Mean Time To Resolve)** = average of `(closedAt − createdAt)` across all closed `bug` issues, displayed in days/hours; also broken down by discovery label.

Bug issues must carry one of three discovery labels (in addition to `bug`) for the escape rate formula to work:

| Label                     | Meaning                                         | Color  |
| ------------------------- | ----------------------------------------------- | ------ |
| `found-by-test`           | Caught by automated Playwright (or other) tests | green  |
| `found-by-manual-testing` | Discovered manually during staging testing      | yellow |
| `found-in-production`     | Reported by actual users on production          | red    |

MTTR is calculated for all `bug`-labeled issues regardless of discovery method, and also broken down per discovery label for insight into resolution speed by source.

After calculating metrics, the workflow runs `scripts/generate-quality-metrics.py` to generate `QUALITY_METRICS.md` (a persistent, unified view readable directly on GitHub) and update `quality-metrics-history.json` with a new data point. Both files are committed to a new branch and a pull request is opened automatically.

**Self-Healing Selector Fix:** `.github/workflows/self-healing.yml` — triggers via `workflow_run` after "Playwright Typescript Tests" completes with a failure; detects selector/locator errors in the test results and proposes fixes. When a PR's tests fail due to a broken selector, posts a comment on the PR with the fix suggestion. When tests on `main` or a schedule run fail, creates a draft PR applying the fix. The workflow uses pre-computed `selector-fix.md` attachments when `AI_DIAGNOSIS` is enabled, or falls back to calling the AI provider (Anthropic/Gemini, configured via `AI_PROVIDER`) directly with the DOM snapshot. Requires `SELF_HEALING=true` in repository variables. Loop prevention is enforced via six layers: branch name guard (skips `fix/self-healing-*` branches), the existing approval gate (draft PRs have no approval so tests don't run on them), max 2 comments per PR, draft PR deduplication, per-branch concurrency groups, and failure-only triggering. The script (`scripts/self-healing.py`) has a comprehensive unit test suite (`scripts/test_self_healing.py`) covering all loop prevention scenarios.

---

## MCP servers

Four MCP servers are declared in `.mcp.json` and loaded automatically by any MCP-compatible AI assistant opened from the repo root. All four are loaded automatically — no local setup needed beyond having Node.js and Docker installed (and a one-off `npm run build` in `mcp/quality-metrics/` for the local server).

| Server                | Key in `.mcp.json`      | Purpose                                                                    |
| --------------------- | ----------------------- | -------------------------------------------------------------------------- |
| playwright-report-mcp | `playwright-report-mcp` | Run Playwright tests and retrieve structured results                       |
| playwright (browser)  | `playwright`            | Live browser automation — navigate, click, screenshot, snapshot            |
| Docker MCP gateway    | `MCP_DOCKER`            | Interact with Docker containers (used with `act` for local CI)             |
| quality-metrics       | `quality-metrics`       | Query defect escape rate, MTTR, and metrics history (local, no deployment) |

### playwright-report-mcp

An MCP server that runs the Playwright test suite and returns structured JSON results, enabling agentic workflows (self-healing, test generation verification) to act on test outcomes without parsing shell output.

**Setup:** No setup required — runs via `npx playwright-report-mcp@latest` from the official npm registry.

**Configuration:** The following environment variables can be set in `.mcp.json` (unset variables use their defaults):

| Variable          | Default                              | Description                                                                                                                                |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PW_DIR`          | `process.cwd()`                      | Root of the Playwright project. Relative paths are resolved against the directory from which the AI assistant is launched (the repo root). |
| `PW_RESULTS_FILE` | `<PW_DIR>/test-results/results.json` | Path to the JSON reporter output file. Override if your `playwright.config.ts` writes results elsewhere.                                   |

This repo sets `PW_DIR` to `playwright/typescript` so the server targets the correct sub-project:

```json
"playwright-report-mcp": {
  "command": "npx",
  "args": ["playwright-report-mcp@latest"],
  "type": "stdio",
  "env": {
    "PW_DIR": "playwright/typescript"
  }
}
```

| Tool                  | Description                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `run_tests`           | Run the test suite (optional `spec`, `browser`, `tag` filters); returns per-test status, duration, and error messages |
| `get_failed_tests`    | Return failed tests from the last run with error messages and attachment paths                                        |
| `get_test_attachment` | Read the content of a named attachment (`dom.xhtml`, `diagnosis.md`) for a specific test                              |
| `list_tests`          | List all tests with their spec file and tags without running them                                                     |

### playwright (browser automation)

Browser automation server from `@playwright/mcp`. Allows MCP-compatible AI assistants to navigate pages, take screenshots, interact with UI elements, and inspect the running application directly from agentic workflows.

**Setup:** No local setup — launched on demand via `npx @playwright/mcp@0.0.68`. Requires Node.js and a network connection on first use.

> Additional tools beyond those listed below are available but not pre-approved in `.claude/settings.json` — Claude Code will prompt for confirmation before using them; other AI assistants may handle this differently.

| Tool                      | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `browser_navigate`        | Navigate to a URL                                     |
| `browser_click`           | Click an element                                      |
| `browser_evaluate`        | Execute JavaScript in the page context                |
| `browser_snapshot`        | Capture an accessibility snapshot of the current page |
| `browser_take_screenshot` | Take a screenshot                                     |

### MCP_DOCKER

Docker MCP gateway. Used for interacting with Docker containers when running GitHub Actions locally via [`act`](https://github.com/nektos/act).

**Setup:** Requires Docker Desktop (or Docker Engine) with the `docker mcp` plugin. No local setup — started on demand via `.mcp.json`.

| Tool       | Description                                  |
| ---------- | -------------------------------------------- |
| `mcp-exec` | Execute a command inside a running container |
| `mcp-find` | Find containers by name or label             |

### quality-metrics

Local MCP server in `mcp/quality-metrics/` that exposes the same defect escape rate, MTTR, and metrics history data as `QUALITY_METRICS.md` — callable on demand from an AI assistant without waiting for the monthly `quality-metrics.yml` workflow run.

**Setup:** Build once from the repo root — `(cd mcp/quality-metrics && npm install && npm run build)`. The server runs via `node mcp/quality-metrics/dist/index.js` as configured in `.mcp.json`.

`get_defect_escape_rate` and `get_mttr` shell out to `scripts/generate-quality-metrics.py --json`, so the values returned are guaranteed to match `QUALITY_METRICS.md`. Requires `gh` to be authenticated locally (the default in a developer session).

| Tool                     | Description                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `get_defect_escape_rate` | Return escape rate percentage and bug counts per discovery label (`found-by-test`, `found-by-manual-testing`, `found-in-production`) |
| `get_mttr`               | Return mean time to resolve for all closed bug issues, and broken down per discovery label                       |
| `get_metrics_history`    | Return all historical data points from `quality-metrics-history.json` as structured JSON                         |

When no `bug`-labeled issues exist, all three tools return a clear `"No bug issues found"` message instead of dividing by zero or throwing.

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

To adapt Bruno to another application, replace the `baseUrl` values in [production.bru](./bruno/environments/production.bru) and [staging.bru](./bruno/environments/staging.bru), then update the requests in [login-valid.bru](./bruno/login-valid.bru) and [login-invalid.bru](./bruno/login-invalid.bru) to match your login endpoint, request body, and expected status codes.

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

**CI:** `.github/workflows/bruno.yml` — runs on push/PR to main/master, `pull_request_review` (submitted/dismissed), and `workflow_dispatch`; a `check-approval` pre-check job requires at least one `APPROVED` review before tests run — push and `workflow_dispatch` events bypass the gate automatically; writes secrets into `bruno/.env`, runs `bru run --env production`, then removes `.env` in a `Cleanup credentials` step (`if: always()`) so no plaintext credentials remain on the runner filesystem after the job. Supports `workflow_dispatch` with a `runner` text input (leave empty to use `vars.RUNNER`) for routing to a local self-hosted runner.

---

## Self-hosted runner

A self-hosted runner lets `quality-metrics.yml` and `update-visual-baselines.yml` push back to the repository from your local Mac (something `act` cannot do — it has no real `GITHUB_TOKEN`).

### Setup

Download the runner package from **GitHub → Settings → Actions → Runners → New self-hosted runner** and follow the on-screen instructions to place the files in a directory **outside** the repository (e.g. `~/actions-runner`). Then register in ephemeral mode — the runner de-registers after each job, giving clean-state behaviour similar to GitHub-hosted runners:

```bash
cd ~/actions-runner
./config.sh \
  --url https://github.com/hubertgajewski/orwellstat \
  --token $(gh api -X POST repos/hubertgajewski/orwellstat/actions/runners/registration-token --jq '.token') \
  --ephemeral
./run.sh
```

Because `--ephemeral` de-registers the runner after every job, you must re-run `./config.sh` (with a freshly generated token) before each subsequent job. To run the runner as a persistent macOS service instead (recommended for regular use):

```bash
./svc.sh install
./svc.sh start
```

> **`svc.sh` is generated by `config.sh`** — it will not exist in the downloaded package. Run `./config.sh` first.

> **Token expiry:** Registration tokens expire after 1 hour. Always generate a fresh token via `gh api -X POST repos/hubertgajewski/orwellstat/actions/runners/registration-token --jq '.token'` immediately before running `./config.sh`.

### Multiple parallel workers

To run parallel jobs (e.g. the full Playwright matrix), register multiple runner instances. `scripts/setup-runners.sh` automates this for 8 workers:

```bash
# 1. Download and extract the runner package to ~/actions-runner-src
#    (GitHub → Settings → Actions → Runners → New self-hosted runner)

# 2. Run the setup script
./scripts/setup-runners.sh
```

The script copies the package into `~/actions-runner-1` … `~/actions-runner-8`, configures each with a unique name (`mac-runner-1` … `mac-runner-8`), and installs + starts a launchd service for each. Re-running the script is safe — it stops and reinstalls existing services before reconfiguring.

### Routing jobs to the self-hosted runner

All jobs resolve their runner via `${{ inputs.runner || vars.RUNNER || 'ubuntu-latest' }}`:

| Priority | Source                               | How to set                                                     |
| -------- | ------------------------------------ | -------------------------------------------------------------- |
| 1        | `inputs.runner` (dispatch override)  | Select in the "Run workflow" dropdown                          |
| 2        | `vars.RUNNER` (repo-wide default)    | GitHub → Settings → Variables → Actions → `RUNNER=self-hosted` |
| 3        | `ubuntu-latest` (hardcoded fallback) | Automatic when `vars.RUNNER` is unset                          |

To activate the self-hosted runner for all push/PR/schedule jobs, set the repository variable once:

```bash
gh variable set RUNNER --body self-hosted
```

To switch everything back to GitHub-hosted:

```bash
gh variable set RUNNER --body ubuntu-latest
# or delete the variable entirely:
gh variable delete RUNNER
```

Each workflow also exposes a `runner` text input on `workflow_dispatch` to override the repo variable for a single run — leave it empty (the default) to respect `vars.RUNNER`:

```bash
# Override to github-hosted for a single run even when RUNNER=self-hosted
gh workflow run quality-metrics.yml --field runner=ubuntu-latest

# Override to self-hosted for a single run when RUNNER is unset
gh workflow run quality-metrics.yml --field runner=self-hosted
```

### Security model

Three hardening measures are in place regardless of repo visibility:

- **Ephemeral mode** — `--ephemeral` de-registers the runner after each job so no state persists between runs. Applies to the manual single-run setup; the persistent launchd services created by `setup-runners.sh` do not use `--ephemeral` (a service runner would de-register after the first job and stop).
- **Repo identity guard** — every self-hosted-routable job carries `if: github.repository == 'hubertgajewski/orwellstat'`, which prevents execution if the repo is ever forked on GitHub and the fork's workflow_dispatch tries to reach this runner.
- **Write-access-only override** — the `runner` input is on `workflow_dispatch` only; only collaborators with write access can dispatch workflows, so only they can switch to `ubuntu-latest`. Non-GitHub forks (GitLab, Bitbucket, local clones) cannot reach the runner at all — it only accepts jobs dispatched by GitHub's own infrastructure.

> **Runner offline:** When `vars.RUNNER=self-hosted` and the runner is unavailable, jobs queue indefinitely. To unblock: run `gh variable set RUNNER --body ubuntu-latest` (affects all future runs) or dispatch with `--field runner=ubuntu-latest` (single run only).

---

## Running GitHub Actions locally

Use [`act`](https://github.com/nektos/act) to run workflows locally before pushing.

> **Note:** The commands in this section were verified on macOS only. Linux and Windows 11 equivalents are provided as a best-effort guide and may require adjustments.

> **Push-back workflows:** Workflows that commit and push results back to the repository (e.g. `quality-metrics.yml`) will always fail the `git push` step in `act`. This is expected — `act` containers have no GitHub credentials, so the push falls back to SSH and is rejected. All other steps (tool installation, script execution, git commit) run and can be verified locally. The push itself only works in real GitHub Actions, where `actions/checkout` injects `GITHUB_TOKEN` as a HTTPS credential automatically.

### Requirements

- **Docker Desktop** — must be running ([docker.com](https://www.docker.com/products/docker-desktop/))
- **act**
  - macOS: requires [Homebrew](https://brew.sh), then `brew install act`
  - Linux: run the official install script (`curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash`), or download a binary from [nektos/act releases](https://github.com/nektos/act/releases) and add it to `PATH`
  - Windows 11: `winget install nektos.act` (winget is included with Windows 11)

### Usage

```bash
# Run the default push trigger
act push

# Run a specific workflow
act push -W .github/workflows/playwright-typescript.yml
act push -W .github/workflows/bruno.yml
```

On first run, `act` will ask for a Docker image size — choose **Medium** (~500MB). The Playwright workflow installs browsers via `npx playwright install --with-deps`; the Bruno workflow only needs Node and `npm ci`.

> **Credentials and platform config:** The repo root contains `.actrc` which automatically passes `--secret-file .env`, `--var-file .vars`, and `--container-architecture linux/amd64` to every `act` invocation. The architecture flag is required on Apple Silicon (M-series) Macs and is a no-op on x86-64 hardware. `ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` from `.env` are loaded as secrets with no extra flags needed. Copy `.vars.example` to `.vars` and set variables to `true` to enable the corresponding workflow jobs and features — without this, all gated jobs are skipped.

### workflow_dispatch

To trigger a workflow that uses `workflow_dispatch` inputs (e.g. run a single browser project):

```bash
# Single browser via workflow_dispatch project input
act workflow_dispatch -W .github/workflows/playwright-typescript.yml \
  --input project=chromium

# With explicit matrix filter (alternative — skips the setup-matrix job)
act push -W .github/workflows/playwright-typescript.yml --matrix id:chromium
```

> **Note:** `act workflow_dispatch` bypasses the `check-approval` gate (same as real `workflow_dispatch` on GitHub). Use `--input project=chromium|firefox|webkit` to limit which browser projects run.

### Credential hygiene

`act` containers are ephemeral but stopped containers persist on the host filesystem until pruned. Run after sensitive sessions:

```bash
docker container prune
```

### Workflow compatibility

| Workflow                      | `act` support    | Notes                                                                    |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------ |
| `playwright-typescript.yml`   | ✅ Full          | `detect-act` step skips artifact upload                                  |
| `bruno.yml`                   | ✅ Full          | No artifacts; credentials injected via `--secret-file`                   |
| `test-coverage.yml`           | ✅ Partial       | Script runs; no push-back needed                                         |
| `quality-metrics.yml`         | ⚠️ Partial       | All steps run; `gh pr create` fails — no `GITHUB_TOKEN` in `act` containers |
| `update-visual-baselines.yml` | ⚠️ Partial       | Baselines generated locally; `git push` fails                            |
| `claude-code-review.yml`      | ❌ Not supported | Requires real GitHub PR context (`gh pr review` cannot target a real PR) |

### Docker RAM requirements for the Playwright matrix

The matrix strategy runs 5 browser projects in parallel, each in its own container. Every container installs Chromium (required by the auth setup project) plus its own browser:

| Job           | Browsers installed | RAM                                        |
| ------------- | ------------------ | ------------------------------------------ |
| Chromium      | chromium           | ~1.0 GB                                    |
| Mobile Chrome | chromium           | ~1.0 GB                                    |
| Firefox       | chromium + firefox | ~1.4 GB                                    |
| WebKit        | chromium + webkit  | ~1.2 GB                                    |
| Mobile Safari | chromium + webkit  | ~1.2 GB                                    |
| **Total**     |                    | **~5.8 GB active + ~2 GB Docker overhead** |

**8 GB Docker RAM (default) — run a single browser only**

With the default Docker Desktop memory limit (~8 GB), running all 5 matrix jobs simultaneously causes container OOM kills. Run Chromium only:

```bash
act push -W .github/workflows/playwright-typescript.yml --matrix id:chromium
```

**16 GB+ Docker RAM — full matrix run**

With 16 GB allocated to Docker, all 5 browser containers fit in memory and can run in parallel, matching CI exactly:

```bash
act push -W .github/workflows/playwright-typescript.yml
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
