# orwellstat — End-to-End Test Suite

Multi-language, multi-framework end-to-end test suite for [Orwell Stat](https://orwellstat.hubertgajewski.com) — a Polish-language web analytics and statistics service.

## Claude skills

Five project-scoped skills are available in Claude Code (stored in `.claude/skills/`) and appear in the VSCode extension `/` menu:

| Skill             | Usage                         | What it does                                                                                                                                                                                                            |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/fix-issue`      | `/fix-issue <number>`         | Fixes a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR                                                                                                                                  |
| `/create-issue`   | `/create-issue <description>` | Scaffolds a GitHub issue in the documented format (User Story / Context / AC / Implementation Hint / DoD / milestone) and creates it via `gh issue create`                                                              |
| `/deep-review`    | `/deep-review`                | Works through every item on the code review checklist from `.claude/skills/deep-review/SKILL.md`, applies general diff checks and CI workflow checks, and explicitly states a finding (pass / fail / N/A) for each item |
| `/generate-stubs` | `/generate-stubs`             | Reads `coverage-matrix.json`, finds uncovered page-category combinations (excluding `title` and `api`), and generates `test.fixme()` stubs in the appropriate spec files                                                |
| `/generate-test`  | `/generate-test <page>`       | Scaffolds `test.fixme()` blocks for one page's content / accessibility / visual-regression gaps in `coverage-matrix.json`, appending to existing spec files (never overwriting) or creating new ones                    |

## Project board

Planning and progress tracking for this repo live in [GitHub Project #1](https://github.com/users/hubertgajewski/projects/1). **T-shirt sizing on epics, Fibonacci story points on stories** — the two fields never overlap on a single item. The `/create-issue` skill is authoritative for how to populate the fields; see `.claude/skills/create-issue/SKILL.md`.

### Point scale (stories only)

Estimate is a relative-complexity judgment, not a time estimate. Pick by analogy to the reference story.

| Points | Meaning                                                                                                             | Examples               |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1      | Trivial — single-line change, doc tweak, config swap                                                                | #191, #211, #215, #227 |
| 2      | Small — single-file logic change, minor bug, understood scope                                                       | #198, #217, #232       |
| 3      | **Reference ⚓** — new skill, new MCP server, moderate refactor across 3–5 files                                    | #145                   |
| 5      | Complex — coordinated multi-file changes, visible uncertainty                                                       | #176                   |
| 8      | Big — many moving parts, significant unknowns                                                                       |                        |
| 13     | **Warning zone** — review for splitting or promoting to an epic. Proceed at 13 only if a split would be artificial. |                        |
| 21+    | **Not allowed** — must become an epic and be broken into child stories.                                             |                        |

### Size scale (epics only)

Size is a coarse roadmap guess for epics, not a mechanical sum of children's points.

| Size | Intuition                                                   |
| ---- | ----------------------------------------------------------- |
| XS   | Micro-epic: exactly 2 trivial (1-pt) stories, ≤ 2 pts total |
| S    | Small: 2–3 stories, narrow scope                            |
| M    | Moderate: 4–6 stories                                       |
| L    | Large: 5–9 stories                                          |
| XL   | Very large: 6+ stories and/or a major cross-cutting concern |

### Epic / Story convention

- Stories are regular issues; prefix like `[bug]`, `[ci]`, `[enhancement]`, etc. They carry Estimate (points), no Size.
- Epics prefix with `[epic]` and apply the `epic` label. They carry Size (T-shirt), no Estimate.
- A story joins an epic via GitHub's sub-issue relationship (surfaced on the board as `Parent issue` and auto-counted in `Sub-issues progress`).
- Retrospective epics (groupings of already-closed stories) are allowed — they exist to organize history. Their children can be closed; the epic itself ships as `N/N complete`.

### Dates

- `Start date` — day work began. First commit day, or the day the story moved to `In progress`.
- `Target date` — planned merge day while in flight, actual merge day once Done.
- For retrospective epics: Start = earliest child `createdAt`, Target = latest child `closedAt`.

### Actual hours

- `Actual hours` is a **retrospective** numeric field, populated by the `/fix-issue` skill after a PR merges.
- Value = sum of active-commit-day hours derived from `git log` timestamps.
- Used as a scale-drift detector (e.g. if 3-pointers routinely take 5 h instead of ~1 h, the scale needs re-anchoring). Never used as an input to estimation — points are chosen by analogy, never by hours.

## Repository structure

```
.env                        # credentials (git-ignored); see .env.example
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD, ORWELLSTAT_USER_EMPTY, ORWELLSTAT_PASSWORD_EMPTY, ENV, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
.vars                       # CI repository variables (git-ignored); see .vars.example
.vars.example               # template: AI_REVIEW, PLAYWRIGHT_TYPESCRIPT, BRUNO, QUALITY_METRICS, AI_DIAGNOSIS, AI_PROVIDER, AI_MODEL_FAST, AI_MODEL_STRONG, ANTHROPIC_BASE_URL, ANTHROPIC_DEFAULT_SONNET_MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL, SELF_HEALING
.mcp.json                   # MCP server definitions (MCP_DOCKER, playwright, playwright-report-mcp, quality-metrics) — loaded by Claude Code and other MCP-compatible AI assistants
.github/workflows/          # CI workflows (one per sub-project)
CLAUDE.md                   # repository-specific behavioral guidance for Claude Code
AGENTS.md                   # Codex entrypoint; delegates shared repository guidance to CLAUDE.md
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

> Each Playwright minor bump ships new Chromium/WebKit/Firefox engine builds; expect sub-pixel baseline drift in `tests/visual.spec.ts-snapshots/` (e.g. 1.58.2 → 1.59.1 shifted WebKit and Mobile Safari `-linux` baselines by ~2 px height, see #294) and refresh `-linux` snapshots via `update-visual-baselines.yml` before merging the dependency PR.

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
ORWELLSTAT_USER=<populated-account username>
ORWELLSTAT_PASSWORD=<populated-account password>
ORWELLSTAT_USER_EMPTY=<empty-account username>
ORWELLSTAT_PASSWORD_EMPTY=<empty-account password>
ENV=<production|staging>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
ANTHROPIC_API_KEY=<Anthropic API key>
GEMINI_API_KEY=<Gemini API key>
OPENROUTER_API_KEY=<OpenRouter API key (required when ANTHROPIC_BASE_URL points to OpenRouter)>
```

`ORWELLSTAT_USER` / `ORWELLSTAT_PASSWORD` are the default (**populated**) account — real hit data. `ORWELLSTAT_USER_EMPTY` / `ORWELLSTAT_PASSWORD_EMPTY` are the **empty** account — no hits in the last 30 days — used by tests asserting empty-state UI (see **Account fixtures** below). Both pairs are required for all environments. `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are only needed when running against staging — Playwright passes them automatically as HTTP Basic Auth credentials when set. `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` are optional — when the active provider's key is present alongside `AI_DIAGNOSIS=true` in `.vars`, failed tests receive an `AI diagnosis` attachment in the Playwright report; when either is absent the fixture behaves identically to without them. Set `AI_PROVIDER` in `.vars` to choose the provider (`anthropic` by default, or `gemini`). `OPENROUTER_API_KEY` is required when `ANTHROPIC_BASE_URL` in `.vars` points to OpenRouter (or any Anthropic-compat proxy); the PR reviewer uses it as the Bearer auth token. Get one at https://openrouter.ai/keys. In CI, secrets are injected as GitHub Actions secrets and variables via GitHub Actions variables. Sub-projects load them via `dotenv` with a path pointing two levels up (`../../.env` and `../../.vars`).

### CI repository variables

The following variables are set in **GitHub → Settings → Variables → Actions** (not secrets, not `.env`). Locally they live in `.vars` (loaded by Playwright via dotenv and by `act` via `--var-file`). Most are opt-in gates: set to exactly `true` to enable; when absent or any other value the feature or workflow job is skipped. Exception: `workflow_dispatch` runs always bypass the approval gate and run tests regardless of the variable value. `RUNNER` is not a boolean gate — set it to `self-hosted` to route all non-dispatch jobs to the local runner, or leave it unset to use `ubuntu-latest`.

| Variable                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                         | When it applies                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_DIAGNOSIS`                   | AI-powered test failure diagnosis attachment                                                                                                                                                                                                                                                                                                                                                                                                    | Every Playwright run (local and CI)                                                                                                               |
| `AI_PROVIDER`                    | AI provider for diagnosis (`anthropic` or `gemini`; default: `anthropic`)                                                                                                                                                                                                                                                                                                                                                                       | Every Playwright run (local and CI)                                                                                                               |
| `AI_MODEL_FAST`                  | Override fast-tier model (diagnosis); empty = provider default                                                                                                                                                                                                                                                                                                                                                                                  | Every Playwright run (local and CI)                                                                                                               |
| `AI_MODEL_STRONG`                | Override strong-tier model (selector fix); empty = provider default                                                                                                                                                                                                                                                                                                                                                                             | Every Playwright run (local and CI)                                                                                                               |
| `ANTHROPIC_BASE_URL`             | Base URL for PR reviewer; empty = native Anthropic, `https://openrouter.ai/api/v1` = OpenRouter                                                                                                                                                                                                                                                                                                                                                 | PR events via `claude-code-review.yml`                                                                                                            |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet-tier model slug for PR reviewer; required when `ANTHROPIC_BASE_URL` is set                                                                                                                                                                                                                                                                                                                                                               | PR events via `claude-code-review.yml`                                                                                                            |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | Haiku-tier model slug for PR reviewer; required when `ANTHROPIC_BASE_URL` is set                                                                                                                                                                                                                                                                                                                                                                | PR events via `claude-code-review.yml`                                                                                                            |
| `AI_REVIEW`                      | `claude-code-review.yml`                                                                                                                                                                                                                                                                                                                                                                                                                        | PR events (opened, synchronize, ready_for_review, reopened)                                                                                       |
| `PLAYWRIGHT_TYPESCRIPT`          | `playwright-typescript.yml`, `playwright-typescript-lint.yml`                                                                                                                                                                                                                                                                                                                                                                                   | PR events, push to main, Sunday 03:00 UTC schedule, `workflow_dispatch` (tests); PR and push to main on `playwright/typescript/**` changes (lint) |
| `BRUNO`                          | `bruno.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                     | PR events, push to main, `workflow_dispatch`                                                                                                      |
| `QUALITY_METRICS`                | `quality-metrics.yml`                                                                                                                                                                                                                                                                                                                                                                                                                           | 1st of every month 06:00 UTC schedule, `workflow_dispatch`                                                                                        |
| `SELF_HEALING`                   | `self-healing.yml`                                                                                                                                                                                                                                                                                                                                                                                                                              | After any failed Playwright Typescript Tests workflow run                                                                                         |
| `RUNNER`                         | Default runner for all workflow jobs                                                                                                                                                                                                                                                                                                                                                                                                            | Push, PR, schedule, `workflow_dispatch` (dispatch dropdown overrides this)                                                                        |
| `VALIDATE_REMOTE`                | Switches `validation.spec.ts` from local validators to the W3C services. Default (absent/`false`) = local `xmllint` for XHTML + local `csstree-validator` for CSS — no network traffic, no third-party dependency, no authenticated HTML leaves the runner. `true` = remote cross-check (XHTML POSTed to `validator.w3.org/check`, CSS URIs handed to `jigsaw.w3.org/css-validator` — use sparingly; jigsaw has flaked with 403/429/5xx on CI). | Every Playwright run (local and CI)                                                                                                               |

### AI diagnosis data egress

When `AI_DIAGNOSIS=true`, every failed test POSTs its error messages, up to 30 000 chars of DOM, and its browser console logs to the configured provider (Anthropic or Gemini). Before transport, `redactSensitive()` in `utils/diagnosis.util.ts` masks the following well-known secrets:

| Category                   | Pattern (case-insensitive)                                  | Replacement                        |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| Cookie header value        | `Cookie: <name>=<value>` (value until `;"<>` or newline)    | `Cookie: <name>=[REDACTED]`        |
| Bearer token (with header) | `Authorization: Bearer <token>`                             | `Authorization: Bearer [REDACTED]` |
| Bearer token (standalone)  | `bearer <token>` where token is 12+ chars of `A-Za-z0-9._-` | `bearer [REDACTED]`                |
| Email local-part           | `<local>@<domain>`                                          | `<first-char>***@<domain>`         |

**What still crosses the provider boundary after redaction:**

- Full XHTML DOM structure (tag names, attribute names, data-\* attributes, CSS class names), which can fingerprint the application.
- Test metadata: test title, browser project name, status, expected status.
- Error messages verbatim apart from the redactions above — assertion diffs, stack traces, and any locator strings are forwarded.
- Base URL, request paths, and non-redacted query strings visible in the DOM or console logs.
- Session IDs, CSRF tokens, or secrets that **do not** match one of the four patterns above (e.g. a JWT in a `data-token` attribute, a CSRF token in a hidden `<input>`, anything inside JSON without the `Cookie:`/`Authorization:` prefix).

If a test can render data that falls outside those patterns, keep `AI_DIAGNOSIS` unset for that suite, or extend `REDACT_PATTERNS` before enabling it.

The local `dom.xhtml` Playwright attachment is **not** redacted — it is only ever saved to the test's output directory (and any published Playwright report artifact). Redaction happens in memory on the copy sent to the AI provider.

## Getting started

After cloning the repo and filling in `.env`, run the setup step:

```bash
# Playwright tests
cd playwright/typescript && npm ci && npx playwright install --with-deps && cd ../..
```

Then open your AI assistant from the **repo root** so `.mcp.json` is picked up and all MCP server tools are available.

## Working with git worktrees

Per-issue worktrees under `.claude/worktrees/` let parallel Claude Code sessions avoid colliding on HEAD. Gitignored env files (`.env`, `.vars`, `bruno/.env`) are auto-symlinked into a new worktree by a `PostToolUse` hook on `git worktree add` and Claude Code's `EnterWorktree` tool — you do not need to copy anything by hand. If you create a worktree in a way the hook cannot see (a script spawned outside Claude Code, an editor plugin, etc.), run `./scripts/provision-worktree-env.sh <worktree-path>` once; the script is idempotent, so re-running is safe.

The `Bash` hook parses the first non-flag positional argument after `add` (skipping `-b <branch>` / `-B <branch>`), matching the common `git worktree add <path> [<branch>]` and `git worktree add -b <branch> <path>` invocations.

**Windows (best-effort, unverified):** run Claude Code inside Git Bash or WSL so the hooks (`jq` / `awk` / `bash`) can execute — the existing husky pre-commit hook already assumes this. Native NTFS symlinks need Windows 10/11 Developer Mode (Settings → Privacy & Security → For developers → Developer Mode) or an elevated PowerShell; without either, the provisioning script auto-falls back to copying the three env files and prints a stderr `WARN`. Copies drift from the main checkout — re-run `./scripts/provision-worktree-env.sh <path>` after any edit to `.env` / `.vars` / `bruno/.env` in the main checkout. This path is designed-for but not CI-verified; please open an issue if it breaks.

## Adapting to your own environment

For adapting this repo to a different deployment target, see [FORK.md](FORK.md).

---

## playwright/typescript

Playwright test suite in TypeScript covering navigation, accessibility, API responses, and page content.

### Setup

```bash
cd playwright/typescript
npm ci
npx playwright install --with-deps
```

`npm ci` triggers the `prepare` script, which wires [husky](https://typicode.github.io/husky) hooks (see **Pre-commit hook** below). No manual setup is required.

### Pre-commit hook

[`playwright/typescript/.husky/pre-commit`](./playwright/typescript/.husky/pre-commit) runs on every local `git commit`:

1. [`lint-staged`](https://github.com/lint-staged/lint-staged) auto-formats staged `*.{ts,tsx,js,json,md,yml,yaml}` files in `playwright/typescript/` with Prettier and re-stages them.
2. `npx tsc --noEmit` fails the commit if any staged TypeScript has type errors.

To intentionally bypass (e.g. for a WIP checkpoint), use `git commit --no-verify` — the same checks still run in CI and block the merge.

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
npx playwright test tests/register.spec.ts
npx playwright test tests/password-reset.spec.ts
npx playwright test tests/zone-information.spec.ts
npx playwright test tests/zone-stats.spec.ts
npx playwright test tests/zone-hits.spec.ts
npx playwright test tests/zone-scripts.spec.ts
npx playwright test tests/zone-admin.spec.ts
npx playwright test tests/forms.spec.ts

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

# Cross-check XHTML and CSS validation against the classic W3C services
# (default XHTML is local `xmllint` — install it with `brew install libxml2` on macOS or
# `sudo apt install libxml2-utils` on Debian/Ubuntu; default CSS is local `csstree-validator`,
# already a dev dependency)
VALIDATE_REMOTE=true npx playwright test tests/validation.spec.ts

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

# Run unit tests (node:test suite for utility helpers such as diagnosis.util's redactSensitive)
npm run test:unit
```

### Test tags

Tests are tagged `@smoke` or `@regression` using Playwright's test options syntax (`{ tag: '@smoke' }`).

| Tag           | Purpose                                                                              | Files                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@smoke`      | Quick health check: HTTP status, page titles, heading visibility                     | `api.spec.ts`, `navigation.spec.ts`                                                                                                                                                                                                                                                                                                                             |
| `@regression` | Deep checks: table content, SVG analysis, external link hrefs, accessibility, visual | `home.spec.ts`, `about-system.spec.ts`, `contact.spec.ts`, `statistics.spec.ts`, `accessibility.spec.ts`, `validation.spec.ts`, `visual.spec.ts`, `network-mocking.spec.ts`, `register.spec.ts`, `password-reset.spec.ts`, `zone-information.spec.ts`, `zone-stats.spec.ts`, `zone-hits.spec.ts`, `zone-scripts.spec.ts`, `zone-admin.spec.ts`, `forms.spec.ts` |

Use `--grep` to run a subset and `--grep-invert` to exclude it (see [Running tests](#running-tests)).

### Architecture

**Directory structure** (`playwright/typescript/`):

- `tests/` — Playwright test specs (`.spec.ts`)
  - `navigation.spec.ts` — UI navigation and title tests; tagged `@smoke`
  - `api.spec.ts` — HTTP-level tests for public and authenticated pages, plus the `/zone/` login CSRF gate: `failed authentication` GETs the login form to extract the rendered `_csrf` hidden input before POSTing bad credentials (asserts 401); sibling tests pin the CSRF-rejection paths (POST without `_csrf` → 403; POST with mismatched `_csrf` → 403); tagged `@smoke`
  - `accessibility.spec.ts` — WCAG accessibility tests across pages; tagged `@regression`
  - `home.spec.ts` — Home page content and navigation tests (including `PreviouslyAddedPage`); tagged `@regression`
  - `about-system.spec.ts` — About System page headings and statsbar content tests; tagged `@regression`
  - `contact.spec.ts` — Contact page headings and statsbar content tests; tagged `@regression`
  - `statistics.spec.ts` — Service statistics page: SVG chart rendering and statistics table tests; tagged `@regression`
  - `validation.spec.ts` — XHTML DTD and CSS validation tests across all pages. XHTML validation runs locally via `xmllint` by default (no network traffic, authenticated HTML never leaves the runner); CSS validation runs locally via `csstree-validator` by default (fully offline, independent of the flaky W3C jigsaw service — see #340). Set `VALIDATE_REMOTE=true` to switch both to the classic W3C services (`validator.w3.org/check` for XHTML, `jigsaw.w3.org/css-validator` for CSS) for a periodic official cross-check. Chromium-only; tagged `@regression`
  - `network-mocking.spec.ts` — Network mocking tests using `page.route()`: mocks the SVG chart endpoint with a static response (deterministic render, no animation timing) and mocks the W3C markup validator to return validation errors (negative test for error detection); Chromium-only; tagged `@regression`
  - `visual.spec.ts` — Full-page visual regression snapshots for home (default and Purple Rain style), about system, contact, and statistics pages using `toHaveScreenshot()` with `maxDiffPixelRatio: 0.01`; home page masks `#statsbar` lists (dynamic new-browser/OS list items) via `getByRole('list')`; statistics page masks `getByRole('table')` (live data) and `object[type="image/svg+xml"]` (dynamic SVG chart), removes all but the first 5 rows from the statistics table via `page.evaluate()` to keep the footer at a stable position regardless of how many browser/OS rows live data contains (CSS height/overflow tricks are ineffective here: Playwright's `fullPage` screenshot and mask both use the element's full bounding box, not the clipped visual; physically removing rows is the only reliable fix), waits for `<object>` to be visible before screenshotting to stabilise layout, and disables animations; baselines stored in `tests/visual.spec.ts-snapshots/` with per-platform suffixes (`-darwin`, `-linux`); also holds `test.fixme` stubs for the register, password reset, previously added, information, stats, hits, scripts, and admin pages (coverage matrix gaps — see `coverage-matrix.json`); tagged `@regression`
  - `register.spec.ts` — `test.fixme` stub for the registration page content (coverage matrix gap); tagged `@regression`
  - `password-reset.spec.ts` — `test.fixme` stub for the password reset page content (coverage matrix gap); tagged `@regression`
  - `zone-information.spec.ts` — `test.fixme` stub for the authenticated information page content (coverage matrix gap); tagged `@regression`
  - `zone-stats.spec.ts` — `test.fixme` stub for the authenticated stats page content (coverage matrix gap); tagged `@regression`
  - `zone-hits.spec.ts` — `test.fixme` stub for the authenticated hits page content (coverage matrix gap); tagged `@regression`
  - `zone-scripts.spec.ts` — authenticated scripts page content (three section headings visible; each snippet textarea matches the canonical snippet body in `test-data/scripts/snippet-{html5,html4,xhtml}.txt`) plus three E2E tracking tests that materialise a thin HTML/HTML4/XHTML shell from `test-data/scripts/`, inject the matching canonical snippet and the active Playwright `baseURL`, navigate Playwright to the resulting `file://` URL, wait for the tracking request to fire against `${baseURL}/scripts/`, then assert a row with a unique per-run marker appears in `/zone/hits/`; tagged `@regression`
  - `zone-admin.spec.ts` — `test.fixme` stub for the authenticated admin page content (coverage matrix gap); tagged `@regression`
  - `forms.spec.ts` — `test.fixme` stubs for the `login`, `hitsFilter`, and `adminSettings` forms (coverage matrix gaps — see the `forms` section of `coverage-matrix.json`); tagged `@regression`
- `auth.setup.ts` — Playwright auth setup: logs in via UI as both the **populated** and **empty** accounts, saving `.auth/populated.json` and `.auth/empty.json`. The two logins run sequentially within a non-parallel `setup` project to avoid back-to-back login throttling.
- `pages/` — Page Object Model classes
  - `base.page.ts` — `BasePage` interface (`url`, `title`, `goto()`, `heading`, optional `accessKey`)
  - `abstract.page.ts` — `AbstractPage` abstract class implementing `BasePage` boilerplate; all page classes extend this; defines shared static strings (`signIn`, `loggedInAs`, `logoutButton`)
  - `common.ts` — Shared heading string constants (`NEWS`, `NEW_BROWSERS`, `NEW_OSES`) used by multiple page classes
  - `public/` — Public page classes: `HomePage`, `AboutSystemPage`, `ServiceStatisticsPage`, `ContactPage`, `RegisterPage`, `PasswordResetPage`, `PreviouslyAddedPage`; exported via `index.ts` as `PUBLIC_PAGE_CLASSES` (except `PreviouslyAddedPage`)
  - `authenticated/` — Authenticated page classes: `InformationPage`, `StatsPage`, `HitsPage`, `ScriptsPage`, `AdminPage`; exported via `index.ts` as `AUTHENTICATED_PAGE_CLASSES`
- `fixtures/base.fixture.ts` — Custom Playwright fixture extending `test` with a `page` override that captures browser console logs and an XHTML DOM snapshot (`dom.xhtml` with XML declaration and `<?xml-stylesheet?>` PIs) as attachments on test failure, then calls `attachAiDiagnosis()`; re-exports `expect`, `request`, `Page`, `Locator`, `BrowserContext` from `@playwright/test`; re-exports `pixelmatch` and `PNG` (used for pixel-diff screenshot comparison)
- `fixtures/api.fixture.ts` — Extends `base.fixture.ts` with HTTP request fixtures: `unauthenticatedRequest` (plain context) and `authenticatedRequest` (logs in via POST `/zone/`); import from here in tests that use either fixture. Exposes the `authAccount: 'populated' | 'empty'` option (default `'populated'`) so specs can switch the API session via `test.use({ authAccount: 'empty' })`
- `fixtures/storage-state.ts` — Exports `POPULATED_STORAGE_STATE` and `EMPTY_STORAGE_STATE` path constants used by empty-state specs via `test.use({ storageState: EMPTY_STORAGE_STATE })`
- `utils/accessibility.util.ts` — `expectNoAccessibilityViolations()` using `@axe-core/playwright` (WCAG2AAA)
- `utils/string.util.ts` — `expectHeadings()` helper: asserts visibility of multiple headings on a page
- `utils/validation.util.ts` — `expectValidXhtml(request, xhtml)` validates XHTML 1.0 Strict against the DTD. Default path shells out to local `xmllint --valid --noout` (libxml2, installed via `apt install libxml2-utils` in CI) — no network traffic, no authenticated HTML POSTed to a third party. Remote path (`VALIDATE_REMOTE=true`) POSTs to the classic W3C Markup Validation Service (`validator.w3.org/check`) and asserts no errors; kept available for a periodic official cross-check (the classic W3C validator is correct for XHTML 1.0 Strict; Nu is HTML5-only and gives false positives). `expectValidCss(request, cssUrl)` validates stylesheets against CSS standards. Default path fetches the stylesheet and runs `csstree-validator` locally (offline, no dependency on the W3C jigsaw service which has flaked with 403/429/5xx on CI — see #340) and asserts no errors, emitting a per-line `CSS errors in ${cssUrl}:` report on failure. Remote path (`VALIDATE_REMOTE=true`) queries `jigsaw.w3.org/css-validator` by URI for the official cross-check
- `utils/env.util.ts` — `loadEnv(importMetaUrl, levelsUp)` loads `.env` relative to the calling file; `requireCredentials(account?: 'populated' | 'empty')` validates and returns the correct credentials for the requested account, defaulting to populated. The populated account reads `ORWELLSTAT_USER` / `ORWELLSTAT_PASSWORD`; the empty account requires `ORWELLSTAT_USER_EMPTY` / `ORWELLSTAT_PASSWORD_EMPTY`. Throws a descriptive error if either pair is missing.
- `utils/diagnosis.util.ts` — `attachAiDiagnosis(testInfo, logs, domContent)`: calls the configured AI provider (Anthropic or Gemini, selected by `AI_PROVIDER`) to produce a diagnosis and optional selector-fix attachment on test failure; model names default to a per-provider map but can be overridden via `AI_MODEL_FAST` (diagnosis) and `AI_MODEL_STRONG` (selector fix); pipes the DOM snapshot, console logs, and error messages through `redactSensitive()` before they cross the provider boundary, replacing `Cookie: <name>=<value>` and `Authorization: Bearer <token>` with `[REDACTED]` and masking the local-part of email addresses (`alice@example.com` → `a***@example.com`); no-ops when `AI_DIAGNOSIS=true` is absent or the provider's API key is missing; errors are caught and warned so diagnosis never fails a test
- `utils/diagnosis.util.test.ts` — `node:test` unit suite for `redactSensitive`, co-located with `diagnosis.util.ts`, exercising cookie / bearer / email / mixed / no-match / char-budget / XHTML-structure / multi-line cases; runs via `npm run test:unit` locally and on every PR through `playwright-typescript-lint.yml`
- `utils/css-validator.util.ts` — pure helpers around `csstree-validator` (`getCssErrors`, `formatCssErrors`) used by `expectValidCssLocal`; split out of `validation.util.ts` so they are importable from the node-native unit suite without dragging in the Playwright fixture path aliases
- `utils/css-validator.util.test.ts` — `node:test` unit suite for `getCssErrors` and `formatCssErrors`, proving that intentionally broken CSS (invalid property values, unknown properties, unknown at-rules, aggregated across lines) still reports per-line errors with line numbers and the source URL; runs via `npm run test:unit` locally and on every PR through `playwright-typescript-lint.yml`
- `types/` — Shared TypeScript interfaces; exported via path alias `@types-local/*`
  - `svg-analysis.ts` — `SvgAnalysis` interface: shape of the object returned by `page.evaluate()` in `statistics.spec.ts`
  - `statistics-row.ts` — `StatisticsRow` interface: shape of each data row returned by the bulk `page.evaluate()` in `statistics.spec.ts`
  - `csstree-validator.d.ts` — ambient module declaration for `csstree-validator` (which ships no types), covering the `validateString(css, filename?)` entry point and the `CssValidationError` shape consumed by `utils/css-validator.util.ts`
- `test-data/` — Static test data committed with the test suite
  - `scripts/snippet-html5.txt`, `scripts/snippet-html4.txt`, `scripts/snippet-xhtml.txt` — single source of truth for the HTML5 / HTML4 / application/xhtml+xml tracking-snippet bodies. Both the structural assertion in `tests/zone-scripts.spec.ts` and the tracking fixtures read from these files; each uses `{{ORWELLSTAT_BASE}}` in place of the server origin so the same snippets work against production and staging. If the product changes a snippet on `/zone/scripts/`, refresh the matching `snippet-*.txt` file — the structural test fails first, giving a clear signal.
  - `scripts/tracking-html5.html`, `scripts/tracking-html4.html`, `scripts/tracking.xhtml` — thin HTML / HTML4 / XHTML shells with a `{{SNIPPET}}` placeholder that `tests/zone-scripts.spec.ts` fills with the matching `snippet-*.txt` at runtime before navigating Playwright to the resulting `file://` URL.
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
- All browser projects default to `storageState: '.auth/populated.json'` (populated account). Specs asserting empty-state UI opt in per file via `test.use({ storageState: EMPTY_STORAGE_STATE })` from `@fixtures/storage-state`; API tests use `test.use({ authAccount: 'empty' })` from `@fixtures/api.fixture`. Never branch at runtime on which account is logged in.
- On failure: screenshots, video, and console/DOM log attachments are saved
- `trace: 'on-first-retry'`
- `baseURL` is driven by the `ENV` variable (`production` by default, `staging` when `ENV=staging`); `httpCredentials` are injected automatically when `BASIC_AUTH_USER` is set
- `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01 }` — global threshold for visual regression tests
- `snapshotPathTemplate` includes `{platform}` so macOS (`-darwin`), Linux (`-linux`), and Windows (`-win32`) each have their own baselines; macOS baselines are committed from local runs, Linux baselines are generated via the CI workflow; Windows is not officially supported for local baseline generation — use the CI workflow instead

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master and on `pull_request_review` (submitted/dismissed) with `working-directory: playwright/typescript`; a `check-approval` pre-check job queries the GitHub API for at least one `APPROVED` review before allowing test jobs to run — push, schedule, and `workflow_dispatch` events bypass the gate automatically; uses a matrix strategy (`fail-fast: false`) to run each of the 5 browser projects (Chromium, Firefox, Webkit, Mobile Chrome, Mobile Safari) in parallel, each in its own job; each matrix job installs only the browser it needs (`chromium`, `firefox`, or `webkit`) and uploads its HTML report as `playwright-report-<id>` and its blob report as `blob-report-<id>` (both retained 30 days); blob reports can be merged with `npx playwright merge-reports` to identify flaky tests across runs (see [Running tests](#running-tests)); npm dependencies are cached via `actions/setup-node` `cache: 'npm'` keyed on `package-lock.json`; upload is skipped when running locally with `act`. The `test` job references a **GitHub Environment** (`staging` by default, `production` when selected via `workflow_dispatch`) — this scopes `vars.ENV` and any environment-scoped secrets to that environment and records a deployment entry in the repo's Environments tab; `production` has a required-reviewer protection rule (available now that the repo is public). Also supports `workflow_dispatch` with five inputs: `env` (choice: `staging` / `production`; defaults to `staging` — selects the GitHub Environment and drives `vars.ENV` into Playwright and Bruno), `project` (choice: `all` / `chromium` / `firefox` / `webkit`; defaults to `all` — a `setup-matrix` job computes the matrix at runtime so only matching browser entries run; selecting `chromium` also runs Mobile Chrome, `webkit` also runs Mobile Safari), `update_visual_baselines` (boolean, regenerates Linux baselines for all 5 browser projects via `--update-snapshots` — each matrix job uploads `visual-baselines-linux-<id>` and the `commit-baselines` job downloads all five with `merge-multiple: true` before committing), `ref` (branch to run on; defaults to triggering branch), and `runner` (free-text override — leave empty to use the `RUNNER` repo variable; push/PR/schedule always use `vars.RUNNER` or fall back to `ubuntu-latest`). To generate Linux baselines for a feature branch: Actions → "Playwright Typescript Tests" → "Run workflow" → enter the branch name in `ref`, check `update_visual_baselines`.

**Lint and type-check backstop:** `.github/workflows/playwright-typescript-lint.yml` — runs on push/PR to main/master **only when the diff touches `playwright/typescript/**`or the workflow file itself** (workflow-level`paths`filter); a single`lint-and-types` job (`timeout-minutes: 5`) runs `actions/checkout@v6`→`actions/setup-node@v6` (`node-version: lts/\*`, npm cache keyed on `playwright/typescript/package-lock.json`) → `npm ci`→`npm run format:check`→`npx tsc --noEmit`. Acts as the non-bypassable backstop to the local husky pre-commit hook (see the **Pre-commit hook** section under [playwright/typescript](#playwrighttypescript)) — `git commit --no-verify`cannot escape it. The job is gated by`github.repository == 'hubertgajewski/orwellstat' && vars.PLAYWRIGHT_TYPESCRIPT == 'true'`, matching the sibling test workflow's kill switch. **Branch protection note:** add `lint-and-types`to the required status checks on`main`(Settings → Branches → Branch protection rules →`main`) so failing lint/type runs block merge — the workflow runs automatically on every qualifying PR, but GitHub's merge block is configured separately.

**Standalone baseline update:** `.github/workflows/update-visual-baselines.yml` — `workflow_dispatch`-only workflow that regenerates Linux baselines for all 5 browser projects and commits them back directly; accepts a `branch` input (defaults to `main`) and a `runner` text input (leave empty to use `vars.RUNNER`). Always dispatch against a feature branch (not `main`) — `GITHUB_TOKEN` can push to unprotected branches, so the updated snapshots land on your branch and the open PR picks them up automatically. Use this when you want to regenerate baselines without running the full test suite.

**Automated code review:** `.github/workflows/claude-code-review.yml` — triggers on pull request events (opened, synchronize, ready_for_review, reopened); runs `anthropics/claude-code-action@v1` to review the PR and submit a formal GitHub review via `gh pr review` (Approved / Changes Requested / Commented), making the bot appear in the PR Reviewers section with a status badge; uses inline comments for specific code issues; focuses on Playwright test correctness, POM conventions, TypeScript quality, and consistency.

The workflow uses a **two-tier retry strategy** to balance cost against reliability — chosen in #293 over the simpler "swap to native Sonnet everywhere" option because it keeps the cheap path as the default and only pays the premium when the cheap path actually no-ops:

1. **Primary run — OpenRouter Minimax preset** (or whichever model `ANTHROPIC_BASE_URL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` resolve to in repo variables). Measured at ~$0.038/run on PR #241 — ~7.6× cheaper than native Sonnet 4.6 on substantive diffs. Minimax occasionally skips the mandated `gh pr review` call on trivial diffs (e.g. `.gitignore`, typo-only edits) — the documented failure mode of weaker proxy models on this workflow (see #284, #293).
2. **Fallback run — native Anthropic Sonnet 4.6** (`claude-sonnet-4-6`). Only fires when the primary action succeeded but `claude[bot]` posted zero reviews at `HEAD_SHA`. Measured at ~$0.29/run on PR #241, used only for no-op cases. Expected net cost = primary cost + (no-op rate × fallback cost). Requires the `ANTHROPIC_API_KEY` secret in addition to `OPENROUTER_API_KEY`. Uses the same review criteria and steps as the primary — only the signature line differs so the Backfill step can tell them apart.

Post-steps: `Backfill review signature` appends the `_Reviewed by …_` signature to whichever review was posted if the model forgot. `Fail if no review was posted` runs after both tiers have had a chance — it fails the job only when neither tier produced a review at `HEAD_SHA`, preventing the silent-mandate-skip failure mode (#284) from reaching `main`. It is skipped when the primary action itself failed (e.g. 401 on a self-workflow-edit PR) so the primary error stays the single signal.

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

**Setup:** No setup required — runs via `npx playwright-report-mcp@2.0.1` from the official npm registry. The version is pinned in `.mcp.json` so upstream releases don't silently change behavior between runs.

**Configuration:** The following environment variables can be set in `.mcp.json` (unset variables use their defaults):

| Variable          | Default                              | Description                                                                                                                                |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PW_DIR`          | `process.cwd()`                      | Root of the Playwright project. Relative paths are resolved against the directory from which the AI assistant is launched (the repo root). |
| `PW_RESULTS_FILE` | `<PW_DIR>/test-results/results.json` | Path to the JSON reporter output file. Override if your `playwright.config.ts` writes results elsewhere.                                   |

This repo sets `PW_DIR` to `playwright/typescript` so the server targets the correct sub-project:

```json
"playwright-report-mcp": {
  "command": "npx",
  "args": ["playwright-report-mcp@2.0.1"],
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

| Tool                     | Description                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `get_defect_escape_rate` | Return escape rate percentage and bug counts per discovery label (`found-by-test`, `found-by-manual-testing`, `found-in-production`) |
| `get_mttr`               | Return mean time to resolve for all closed bug issues, and broken down per discovery label                                           |
| `get_metrics_history`    | Return all historical data points from `quality-metrics-history.json` as structured JSON                                             |

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

To adapt Bruno to another application, replace the `baseUrl` values in [production.bru](./bruno/environments/production.bru) and [staging.bru](./bruno/environments/staging.bru), then update the requests in [csrf-bootstrap.bru](./bruno/csrf-bootstrap.bru), [login-valid.bru](./bruno/login-valid.bru), and [login-invalid.bru](./bruno/login-invalid.bru) to match your login endpoint, CSRF-token source, request body, and expected status codes.

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

| File                 | Description                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csrf-bootstrap.bru` | GET `/zone/` (seq 0), extract the rendered `_csrf` hidden input via post-response script, store as `{{bootstrapCsrfToken}}` — expects 200. Captured once; not refreshed after `login-valid.bru` rotates the server-side token on success |
| `login-invalid.bru`  | POST `/zone/` (seq 1) with invalid credentials + `_csrf: {{bootstrapCsrfToken}}` — expects 401                                                                                                                                           |
| `login-valid.bru`    | POST `/zone/` (seq 2) with valid credentials + `_csrf: {{bootstrapCsrfToken}}` — expects 200                                                                                                                                             |

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

| Workflow                         | `act` support    | Notes                                                                                                                   |
| -------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `playwright-typescript.yml`      | ✅ Full          | `detect-act` step skips artifact upload                                                                                 |
| `playwright-typescript-lint.yml` | ✅ Full          | No artifacts; pass `-e PLAYWRIGHT_TYPESCRIPT=true` or `--var PLAYWRIGHT_TYPESCRIPT=true` so the job's `if:` guard opens |
| `bruno.yml`                      | ✅ Full          | No artifacts; credentials injected via `--secret-file`                                                                  |
| `test-coverage.yml`              | ✅ Partial       | Script runs; no push-back needed                                                                                        |
| `quality-metrics.yml`            | ⚠️ Partial       | All steps run; `gh pr create` fails — no `GITHUB_TOKEN` in `act` containers                                             |
| `update-visual-baselines.yml`    | ⚠️ Partial       | Baselines generated locally; `git push` fails                                                                           |
| `claude-code-review.yml`         | ❌ Not supported | Requires real GitHub PR context (`gh pr review` cannot target a real PR)                                                |

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
