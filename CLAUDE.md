# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep this file and `README.md` up to date.** Whenever the project structure changes — new directories, renamed files, new sub-projects, changed commands, updated CI, modified environment variables — update the relevant sections of both files before finishing the task.

For a full project overview, setup instructions, and commands see [README.md](README.md).

---

## Repository structure

```
.env                        # credentials (git-ignored); see .env.example
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD
.github/workflows/          # CI workflows (one per sub-project)
playwright/
  typescript/               # Playwright tests in TypeScript
selenium/                   # Selenium tests (planned)
bruno/                      # Bruno API request collection
```

## Environment variables

Credentials are stored in `.env` at the **repo root** and shared across all sub-projects:

```
ORWELLSTAT_USER=<username>
ORWELLSTAT_PASSWORD=<password>
```

In CI these are injected as GitHub Actions secrets. Sub-projects load them via `dotenv` with a path pointing two levels up (`../../.env`).

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
- `auth.setup.ts` — Playwright auth setup: logs in via UI and saves storage state to `.auth/user.json`
- `pages/` — Page Object Model classes
  - `base.page.ts` — `BasePage` interface (`url`, `title`, `goto()`, `heading`, optional `accessKey`)
  - `abstract.page.ts` — `AbstractPage` abstract class implementing `BasePage` boilerplate; all page classes extend this; defines shared static strings (`signIn`, `loggedInAs`, `logoutButton`)
  - `common.ts` — Shared heading string constants (`NEWS`, `NEW_BROWSERS`, `NEW_OSES`) used by multiple page classes
  - `public/` — Public page classes: `HomePage`, `AboutSystemPage`, `ServiceStatisticsPage`, `ContactPage`, `RegisterPage`, `PasswordResetPage`, `PreviouslyAddedPage`; exported via `index.ts` as `PUBLIC_PAGE_CLASSES` (except `PreviouslyAddedPage`)
  - `authenticated/` — Authenticated page classes: `InformationPage`, `StatsPage`, `HitsPage`, `ScriptsPage`, `AdminPage`; exported via `index.ts` as `AUTHENTICATED_PAGE_CLASSES`
- `fixtures/base.fixture.ts` — Custom Playwright fixture extending `test` with:
  - `authenticatedRequest` — logs in via POST `/zone/` before each test
  - Captures browser console logs and DOM snapshot as attachments on test failure
  - Re-exports `expect`, `request`, `Page`, `Locator`, `BrowserContext` from `@playwright/test`
  - Re-exports `pixelmatch` and `PNG` (used for pixel-diff screenshot comparison)
- `utils/accessibility.util.ts` — `expectNoAccessibilityViolations()` using `@axe-core/playwright` (WCAG2AAA)
- `utils/string.util.ts` — `expectHeadings()` helper: asserts visibility of multiple headings on a page
- `utils/env.util.ts` — `loadEnv(importMetaUrl, levelsUp)` loads `.env` relative to the calling file; `requireCredentials()` validates and returns `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD`, throwing a descriptive error if either is missing
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
- Commented-out staging `baseURL` (`http://stage.orwellstat.hubertgajewski.com`) can be enabled for staging

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master with `working-directory: playwright/typescript`; uploads `playwright/typescript/playwright-report/` as an artifact (retained 30 days); upload is skipped when running locally with `act`.

---

## Code review checklist

Before committing changes to `playwright/typescript`, review against these criteria:

- **Playwright test correctness** — selectors use `getByRole()` / `getByText()` with `exact: true`; no CSS class selectors; no `waitForTimeout()`; count asserted before `.nth()`; no `.first()` silencing missing elements
- **Page Object Model conventions** — page classes extend `AbstractPage`; `heading` getter uses `getByRole('heading', { name: ..., exact: true })`; static `url`, `title`, `accessKey` defined
- **TypeScript quality** — no `!` non-null assertions on env vars; `page.evaluate()` calls have explicit generic type; no implicit `any`; `tsc --noEmit` passes
- **Flakiness** — no fixed timeouts; animation waits use `requestAnimationFrame`; auth setup asserts login actually succeeded
- **Consistency** — new utils documented in `CLAUDE.md`; new page files exported via the appropriate `index.ts`; path aliases used (`@fixtures/*`, `@pages/*`, `@utils/*`)

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
3. Review against the [code review checklist](#code-review-checklist)
4. Run the affected test(s) — must pass
5. Create a branch from remote `main` named `feature/<issue-number>` or `bugfix/<issue-number>` (e.g. `feature/19`)
6. Commit with a **short, single-line message** in the format `<issue-number> <short description>` (e.g. `19 Add explicit SvgAnalysis type to page.evaluate()`). No body, no `Co-Authored-By` trailer — single line only.
7. Push and create a PR

---

## bruno

Bruno API request collection in `bruno/`. Environments are in `bruno/environments/` — `production.bru` and `staging.bru`. Secrets go in `bruno/environments/.env` (git-ignored). Staging requires HTTP Basic authentication (`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`).
