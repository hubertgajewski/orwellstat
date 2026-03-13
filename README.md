# orwellstat — End-to-End Test Suite

Multi-language, multi-framework end-to-end test suite for [Orwell Stat](https://orwellstat.hubertgajewski.com) — a Polish-language web analytics and statistics service.

## Repository structure

```
.env                        # credentials (git-ignored); see .env.example
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD
.github/workflows/          # CI workflows (one per sub-project)
SECURITY.md                 # security policy and vulnerability reporting
playwright/
  typescript/               # Playwright tests in TypeScript
selenium/                   # Selenium tests (planned)
bruno/                      # Bruno API request collection
```

## Prerequisites

| Tool | Required for | Install |
|------|-------------|---------|
| [Node.js](https://nodejs.org/) v18+ | Playwright tests | [nodejs.org](https://nodejs.org/) |
| [Bruno](https://www.usebruno.com/) | API request collection | Standalone app or [VSCode extension](https://marketplace.visualstudio.com/items?itemName=bruno-api-client.bruno) |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Running GitHub Actions locally | [docker.com](https://www.docker.com/products/docker-desktop/) |
| [act](https://github.com/nektos/act) | Running GitHub Actions locally | `brew install act` |

Node.js includes `npm` — no separate installation needed. Docker and `act` are optional — only needed for local CI testing.

## Credentials

Copy `.env.example` to `.env` at the repo root and fill in your credentials:

```
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
```

`ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` are required for all environments. `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are only needed when running against staging — Playwright passes them automatically as HTTP Basic Auth credentials when set. In CI, all four are injected as GitHub Actions secrets.

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

# Specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"

# Single test by name
npx playwright test -g "test name"

# HTML report
npx playwright show-report

# Interactive UI mode
npx playwright test --ui
```

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
- `utils/validation.util.ts` — `expectValidXhtml(request, xhtml)` POSTs raw markup to the classic W3C Markup Validation Service (`validator.w3.org/check`) and asserts no errors (correct for XHTML 1.0 Strict; Nu is HTML5-only and gives false positives); `expectValidCss(request, cssUrl)` queries W3C CSS validator by URI and asserts zero errors
- `utils/env.util.ts` — `loadEnv(importMetaUrl, levelsUp)` loads `.env` relative to the calling file; `requireCredentials()` validates and returns `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD`
- `types/` — Shared TypeScript interfaces; exported via path alias `@types-local/*`
  - `svg-analysis.ts` — `SvgAnalysis` interface: shape of the object returned by `page.evaluate()` in `statistics.spec.ts`
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
- Commented-out staging `baseURL` (`https://stage.orwellstat.hubertgajewski.com`) can be enabled for staging; when enabled, `httpCredentials` are injected automatically if `BASIC_AUTH_USER` is set

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master with `working-directory: playwright/typescript`; uploads `playwright/typescript/playwright-report/` as an artifact (retained 30 days); upload is skipped when running locally with `act`.

---

## bruno

Bruno API request collection for manual and automated HTTP testing.

### Setup

Open the `bruno/` directory in the Bruno standalone app or use the Bruno VSCode extension.

### Environments

| Environment | Base URL |
|---|---|
| production | `https://orwellstat.hubertgajewski.com` |
| staging | `https://stage.orwellstat.hubertgajewski.com` |

Environment secrets (passwords, Basic auth credentials) are stored in `bruno/environments/.env` (git-ignored). Create this file locally:

```
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
```

> Staging requires HTTP Basic authentication in addition to the application login. The `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` variables are only needed for the staging environment.

### Requests

| File | Description |
|---|---|
| `login-valid-credentials.bru` | POST `/zone/` with valid credentials — expects 200 |
| `login-invalid-credentials.bru` | POST `/zone/` with invalid credentials — expects 401 |

---

## Running GitHub Actions locally

Use [`act`](https://github.com/nektos/act) to run workflows locally before pushing.

### Requirements

- **Docker Desktop** — must be running ([docker.com](https://www.docker.com/products/docker-desktop/))
- **act** — `brew install act`

### Usage

```bash
# Run the default push trigger
act push --container-architecture linux/amd64

# Run a specific workflow
act push -W .github/workflows/playwright-typescript.yml --container-architecture linux/amd64
```

On first run, `act` will ask for a Docker image size — choose **Medium** (~500MB). The workflow itself installs Playwright browsers via `npx playwright install --with-deps`.

> **Note:** The `--container-architecture linux/amd64` flag is required on Apple Silicon (M-series) Macs to avoid compatibility issues.

> **Credentials:** The repo root contains `.actrc` which automatically passes `--secret-file .env` to every `act` invocation. `ORWELLSTAT_USER` and `ORWELLSTAT_PASSWORD` from `.env` are loaded as secrets with no extra flags needed.
