# orwellstat — End-to-End Test Suite

Multi-language, multi-framework end-to-end test suite for [Orwell Stat](https://orwellstat.hubertgajewski.com) — a Polish-language web analytics and statistics service.

## Claude skills

Six project-scoped skills are available in Claude Code (stored in `.claude/skills/`) and appear in the VSCode extension `/` menu:

| Skill               | Usage                         | What it does                                                                                                                                                                                                            |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/fix-issue`        | `/fix-issue <number>`         | Fixes a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR                                                                                                                                  |
| `/create-issue`     | `/create-issue <description>` | Scaffolds a GitHub issue in the documented format (User Story / Context / AC / Implementation Hint / DoD / milestone) and creates it via `gh issue create`                                                              |
| `/deep-review`      | `/deep-review`                | Works through every item on the code review checklist from `.claude/skills/deep-review/SKILL.md`, applies general diff checks and CI workflow checks, and explicitly states a finding (pass / fail / N/A) for each item |
| `/deep-review-next` | `/deep-review-next [arg]`     | Multi-agent code review orchestrator — dispatches every project-scoped specialist agent under `.claude/agents/` in parallel against a scope resolved from `arg`: empty (local diff, **US1**), a PR number with optional bias (`213` or `213 focus on race conditions`, **US2**), a git ref or range (`HEAD~3..HEAD`, **US3a**), a file or directory path (`./scripts/self-healing.py`, **US3b**), or any other freeform instruction (**US3c**); surfaces their findings together. The current roster (security / project-checklist / simplification / code / architecture / typescript / python / docs / ci / qa / unit-test) is documented in `.claude/skills/deep-review-next/SKILL.md`. Coexists with `/deep-review` until promoted by dir rename (#435) |
| `/generate-stubs`   | `/generate-stubs`             | Reads `coverage-matrix.json`, finds uncovered page-category combinations (excluding `title` and `api`), and generates `test.fixme()` stubs in the appropriate spec files                                                |
| `/generate-test`    | `/generate-test <page>`       | Scaffolds `test.fixme()` blocks for one page's content / accessibility / visual-regression gaps in `coverage-matrix.json`, appending to existing spec files (never overwriting) or creating new ones                    |

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
.env.example                # template: ORWELLSTAT_USER, ORWELLSTAT_PASSWORD, ORWELLSTAT_USER_EMPTY, ORWELLSTAT_PASSWORD_EMPTY, ORWELLSTAT_EMAIL, ENV, BASIC_AUTH_USER, BASIC_AUTH_PASSWORD, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
.vars                       # CI repository variables (git-ignored); see .vars.example
.vars.example               # template: AI_REVIEW, PLAYWRIGHT_TYPESCRIPT, BRUNO, QUALITY_METRICS, AI_DIAGNOSIS, AI_PROVIDER, AI_MODEL_FAST, AI_MODEL_STRONG, ANTHROPIC_BASE_URL, ANTHROPIC_DEFAULT_SONNET_MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL, SELF_HEALING
.mcp.json                   # MCP server definitions (MCP_DOCKER, playwright, playwright-report-mcp, quality-metrics, coverage-matrix) — loaded by Claude Code and other MCP-compatible AI assistants
.claude/
  skills/                   # project-scoped slash commands (fix-issue, create-issue, deep-review, deep-review-next, generate-stubs, generate-test)
  agents/                   # project-scoped sub-agents dispatched by skills (current roster lives in .claude/skills/deep-review-next/SKILL.md)
.github/workflows/          # CI workflows (one per sub-project)
CLAUDE.md                   # repository-specific behavioral guidance for Claude Code
AGENTS.md                   # Codex entrypoint; delegates shared repository guidance to CLAUDE.md
GEMINI.md                   # Gemini entrypoint; delegates shared repository guidance to CLAUDE.md
QUALITY_METRICS.md          # auto-generated quality metrics report (escape rate, MTTR, coverage, trends)
SECURITY.md                 # security policy, vulnerability reporting, and AI diagnosis data-egress policy
quality-metrics-history.json  # historical quality metrics data points (auto-committed by workflow)
docs/
  CI_LOCAL.md               # self-hosted runner setup and running GitHub Actions locally with act
  FORK.md                   # guide for forking and adapting the suite to a different deployment target
scripts/
  generate-quality-metrics.py  # generates QUALITY_METRICS.md and updates quality-metrics-history.json
  self-healing.py              # self-healing selector fix: parses test artifacts, posts PR comments or creates draft PRs
  test_self_healing.py         # unit tests for self-healing.py (loop prevention, classification, LLM-bound redaction)
  setup-runners.sh             # registers and starts 8 self-hosted runner instances as launchd services
playwright/
  typescript/               # Playwright tests in TypeScript
bruno/                      # Bruno API request collection
mcp/
  shared/                   # shared helpers (repoRoot, ok, err) used by the local MCP servers
  quality-metrics/          # local MCP server exposing escape rate, MTTR, and metrics history
  coverage-matrix/          # local MCP server exposing coverage matrix gaps, summary, and mark_covered
```

> Each Playwright minor bump ships new Chromium/WebKit/Firefox engine builds; expect sub-pixel baseline drift in `tests/visual.spec.ts-snapshots/` (e.g. 1.58.2 → 1.59.1 shifted WebKit and Mobile Safari `-linux` baselines by ~2 px height, see #294) and refresh `-linux` snapshots via `update-visual-baselines.yml` before merging the dependency PR.

## Prerequisites

| Tool                                                              | Required for                   | Install                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18+                               | Playwright tests               | [nodejs.org](https://nodejs.org/)                                                                                                                 |
| [Bruno](https://www.usebruno.com/)                                | API request collection         | Standalone app or [VSCode extension](https://marketplace.visualstudio.com/items?itemName=bruno-api-client.bruno)                                  |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Running GitHub Actions locally | [docker.com](https://www.docker.com/products/docker-desktop/)                                                                                     |
| [act](https://github.com/nektos/act)                              | Running GitHub Actions locally | macOS: `brew install act` (requires [Homebrew](https://brew.sh)); Linux/Windows 11: [nektos/act releases](https://github.com/nektos/act/releases) |
| [actionlint](https://github.com/rhysd/actionlint)                 | `/deep-review-next` GitHub Actions reviewer agent | macOS: `brew install actionlint shellcheck` (requires [Homebrew](https://brew.sh)); other platforms: [rhysd/actionlint releases](https://github.com/rhysd/actionlint/releases) |

Node.js includes `npm` — no separate installation needed. Docker, `act`, and `actionlint` are optional: Docker and `act` are only needed for local CI testing; `actionlint` is only needed when running the `/deep-review-next` GitHub Actions reviewer agent locally.

## Credentials

Copy `.env.example` to `.env` at the repo root and fill in your credentials:

```
ORWELLSTAT_USER=<populated-account username>
ORWELLSTAT_PASSWORD=<populated-account password>
ORWELLSTAT_USER_EMPTY=<empty-account username>
ORWELLSTAT_PASSWORD_EMPTY=<empty-account password>
ORWELLSTAT_EMAIL=<real email currently stored on the populated account>
ENV=<production|staging>
BASIC_AUTH_USER=<staging basic auth user>
BASIC_AUTH_PASSWORD=<staging basic auth password>
ANTHROPIC_API_KEY=<Anthropic API key>
GEMINI_API_KEY=<Gemini API key>
OPENROUTER_API_KEY=<OpenRouter API key (required when ANTHROPIC_BASE_URL points to OpenRouter)>
```

`ORWELLSTAT_USER` / `ORWELLSTAT_PASSWORD` are the default (**populated**) account — real hit data. `ORWELLSTAT_USER_EMPTY` / `ORWELLSTAT_PASSWORD_EMPTY` are the **empty** account — no hits in the last 30 days — used by tests asserting empty-state UI (see **Account fixtures** below). Both pairs are required for all environments. `ORWELLSTAT_EMAIL` is the canonical email currently stored on the populated account; the `zone-admin.spec.ts` mutating-settings tests use it to anchor the post-test restore so a cancelled `afterEach` cannot leave the account stuck at the placeholder address (see #397). `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are only needed when running against staging — Playwright passes them automatically as HTTP Basic Auth credentials when set. `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` are optional — when the active provider's key is present alongside `AI_DIAGNOSIS=true` in `.vars`, failed tests receive an `AI diagnosis` attachment in the Playwright report; when either is absent the fixture behaves identically to without them. Set `AI_PROVIDER` in `.vars` to choose the provider (`anthropic` by default, or `gemini`). `OPENROUTER_API_KEY` is required when `ANTHROPIC_BASE_URL` in `.vars` points to OpenRouter (or any Anthropic-compat proxy); the PR reviewer uses it as the Bearer auth token. Get one at https://openrouter.ai/keys. In CI, secrets are injected as GitHub Actions secrets and variables via GitHub Actions variables. Sub-projects load them via `dotenv` with a path pointing two levels up (`../../.env` and `../../.vars`).

### CI repository variables

The following variables are set in **GitHub → Settings → Variables → Actions** (not secrets, not `.env`). Locally they live in `.vars` (loaded by Playwright via dotenv and by `act` via `--var-file`). Most are opt-in gates: set to exactly `true` to enable; when absent or any other value the feature or workflow job is skipped. `RUNNER` is not a boolean gate — set it to `self-hosted` to route all non-dispatch jobs to the local runner, or leave it unset to use `ubuntu-latest`.

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
| `PLAYWRIGHT_TYPESCRIPT`          | `playwright-typescript.yml`, `playwright-typescript-lint.yml`, `playwright-real-credential.yml`                                                                                                                                                                                                                                                                                                                                                 | PR events, push to main, Sunday 03:00 UTC schedule, `workflow_dispatch` (tests + real-credential); PR and push to main on `playwright/typescript/**` changes (lint) |
| `BRUNO`                          | `bruno.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                     | PR events, push to main, `workflow_dispatch`                                                                                                      |
| `QUALITY_METRICS`                | `quality-metrics.yml`                                                                                                                                                                                                                                                                                                                                                                                                                           | 1st of every month 06:00 UTC schedule, `workflow_dispatch`                                                                                        |
| `SELF_HEALING`                   | `self-healing.yml`                                                                                                                                                                                                                                                                                                                                                                                                                              | After any failed Playwright Typescript Tests workflow run                                                                                         |
| `RUNNER`                         | Default runner for all workflow jobs                                                                                                                                                                                                                                                                                                                                                                                                            | Push, PR, schedule, `workflow_dispatch` (dispatch dropdown overrides this)                                                                        |
| `VALIDATE_REMOTE`                | Switches `validation.spec.ts` from local validators to the W3C services. Default (absent/`false`) = local `xmllint` for XHTML + local `csstree-validator` for CSS — no network traffic, no third-party dependency, no authenticated HTML leaves the runner. `true` = remote cross-check (XHTML POSTed to `validator.w3.org/check`, CSS URIs handed to `jigsaw.w3.org/css-validator` — use sparingly; jigsaw has flaked with 403/429/5xx on CI). | Every Playwright run (local and CI)                                                                                                               |

### AI diagnosis data egress

For the full redaction-pattern table and a description of what data still crosses the provider boundary after redaction, see [SECURITY.md — AI diagnosis data egress](SECURITY.md#ai-diagnosis-data-egress).

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

For adapting this repo to a different deployment target, see [docs/FORK.md](docs/FORK.md).

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

# Single test file (any file under tests/ — full list in the Architecture section below)
npx playwright test tests/navigation.spec.ts
npx playwright test tests/zone-admin.spec.ts

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

Tests are tagged `@smoke` or `@regression` using Playwright's test options syntax (`{ tag: '@smoke' }`). A test or describe may additionally carry one or more **scope tags** for grep filtering — these are not category labels, they are workflow/coverage selectors used by dedicated configs.

| Tag                     | Kind     | Purpose                                                                              | Files                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | -------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@smoke`                | category | Quick health check: HTTP status, page titles, heading visibility                     | `api.spec.ts`, `navigation.spec.ts`                                                                                                                                                                                                                                                                                                                             |
| `@regression`           | category | Deep checks: table content, SVG analysis, external link hrefs, accessibility, visual | `home.spec.ts`, `about-system.spec.ts`, `contact.spec.ts`, `statistics.spec.ts`, `accessibility.spec.ts`, `validation.spec.ts`, `visual.spec.ts`, `network-mocking.spec.ts`, `register.spec.ts`, `password-reset.spec.ts`, `zone-information.spec.ts`, `zone-stats.spec.ts`, `zone-hits.spec.ts`, `zone-scripts.spec.ts`, `zone-admin.spec.ts`, `forms.spec.ts` |
| `@real-credential`      | scope    | Identifies the single regression that fills the real `ORWELLSTAT_PASSWORD`; selected by `playwright.config.real-credential.ts` so the dedicated workflow runs only that test under retries:0 / trace:off (#410) | `zone-admin.spec.ts` (one describe)                                                                                                                                                                                                                                                                                                                              |
| `@auth-populated`       | scope    | Selects the populated-account auth setup test; included in the `@real-credential` workflow's grep so the Chromium project's `dependencies: ['setup']` is satisfied                                              | `auth.setup.ts`                                                                                                                                                                                                                                                                                                                                                  |
| `@auth-empty`           | scope    | Selects the empty-account auth setup test (paired with `@auth-populated` for symmetry; not currently grep-included by any workflow)                                                                              | `auth.setup.ts`                                                                                                                                                                                                                                                                                                                                                  |

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
  - `register.spec.ts` — public `/register/` page content: heading, the four registration-form fields (`#newuser`, `#newpassword`, `#newpassword2`, `#email`) editable inside the `Dane potrzebne do rejestracji` fieldset, the `Rejestruj` submit button enabled, and the unique `Logowanie` nav link visible; tagged `@regression`
  - `password-reset.spec.ts` — public `/password_reset/` content: heading visible, recovery-form `#username` input editable inside the `Dane potrzebne do zresetowania hasła` fieldset (scoped to disambiguate from the duplicate-id login form below), `Resetuj hasło` submit button enabled, and the `#menubar` `Strona główna` link points at `/`; tagged `@regression`
  - `zone-information.spec.ts` — authenticated `/zone/` page: populated-account asserts headings, visit-frequency, every ranking line, footer prose, and the `odsłon` link; empty-account asserts empty-state heading and absence of populated-only locators; tagged `@regression`
  - `zone-stats.spec.ts` — authenticated `/zone/stats/`: SVG chart structural analysis, user-statistics table, and a parameterised `every Parametr` loop that verifies chart label/percent pairs match the data table for all 12 dimensions and that each dimension renders a distinct chart; tagged `@regression`
  - `zone-hits.spec.ts` — authenticated `/zone/hits/`: static content assertions plus a parameterised filter-form suite (seed → filter → assert match; max-length boundary; zero-result boundary) for every text input, and a row-limit combobox test; tagged `@regression`
  - `zone-scripts.spec.ts` — authenticated `/zone/scripts/`: snippet-textarea content assertions against `test-data/scripts/snippet-*.txt` and three E2E tracking tests that fire each embed variant and verify the run-marker UUID appears in `/zone/hits/`; tagged `@regression`
  - `zone-admin.spec.ts` — authenticated `/zone/admin/`: static page-surface assertions, settings-form default state, per-field maxlength, wrong-password and placeholder-email non-mutating flows, real-credential mismatch path, and Chromium-only mutating tests (email, block_ip, block_cookie) with `beforeEach`/`afterEach` restore; tagged `@regression`
  - `forms.spec.ts` — `test.fixme` stub for the `login` form (coverage gap); `hitsFilter` and `adminSettings` are covered in their respective zone spec files; tagged `@regression`
- `auth.setup.ts` — Playwright auth setup: logs in via UI as both the **populated** and **empty** accounts, saving `.auth/populated.json` and `.auth/empty.json`. The two logins run sequentially within a non-parallel `setup` project to avoid back-to-back login throttling. After landing on `/zone/`, each setup asserts that the rendered username (read from `#statsbar` via `AbstractPage.loggedInUsername`) equals the env var (`ORWELLSTAT_USER` / `ORWELLSTAT_USER_EMPTY`) it just tried to authenticate as, so a swapped credential pair fails fast instead of silently producing two valid storage states pointed at the wrong accounts.
- `pages/` — Page Object Model classes
  - `base.page.ts` — `BasePage` interface (`url`, `title`, `goto()`, `heading`, optional `accessKey`)
  - `abstract.page.ts` — `AbstractPage` abstract class implementing `BasePage` boilerplate; all page classes extend this; defines shared static strings (`signIn`, `loggedInAs`, `logoutButton`) and the static `loggedInUsername(page)` helper used by `auth.setup.ts` to assert the rendered identity
  - `common.ts` — Shared heading string constants (`NEWS`, `NEW_BROWSERS`, `NEW_OSES`) used by multiple page classes
  - `public/` — Public page classes: `HomePage`, `AboutSystemPage`, `ServiceStatisticsPage`, `ContactPage`, `RegisterPage`, `PasswordResetPage`, `PreviouslyAddedPage`; exported via `index.ts` as `PUBLIC_PAGE_CLASSES` (except `PreviouslyAddedPage`)
  - `authenticated/` — Authenticated page classes: `InformationPage`, `StatsPage`, `HitsPage`, `ScriptsPage`, `AdminPage`; exported via `index.ts` as `AUTHENTICATED_PAGE_CLASSES`
- `fixtures/base.fixture.ts` — Custom Playwright fixture extending `test` with a `page` override that captures browser console logs and an XHTML DOM snapshot (`dom.xhtml` with XML declaration and `<?xml-stylesheet?>` PIs) as attachments on test failure, then calls `attachAiDiagnosis()`; re-exports `expect`, `request`, `Page`, `Locator`, `BrowserContext`, `APIRequestContext`, and `TestInfo` from `@playwright/test`; re-exports `pixelmatch` and `PNG` (used for pixel-diff screenshot comparison)
- `fixtures/api.fixture.ts` — Extends `base.fixture.ts` with HTTP request fixtures: `unauthenticatedRequest` (plain context, no cookies) and `authenticatedRequest` (Playwright's built-in `request` carrying the project's populated `storageState`; the fixture asserts `GET /zone/` returns 200 so callers fail fast if the seeded cookie is stale). Import from here in tests that use either fixture.
- `fixtures/storage-state.ts` — Exports `POPULATED_STORAGE_STATE` and `EMPTY_STORAGE_STATE` path constants used by empty-state specs via `test.use({ storageState: EMPTY_STORAGE_STATE })`
- `utils/accessibility.util.ts` — `expectNoAccessibilityViolations()` using `@axe-core/playwright` (WCAG2AAA)
- `utils/string.util.ts` — `expectHeadings()` helper: asserts visibility of multiple headings on a page
- `utils/svg-chart.util.ts` — Shared helpers for SVG chart tests on `/statistics/` and `/zone/stats/`: `navigateAndWaitForSvgChart` navigates to a page and waits for its chart sub-resource (`chart.php` per-user, `chart_all.php` site-wide), with an optional pre-auth fetch that primes Firefox's Basic Auth credential cache on staging; `analyzeSvgChart` parses the chart's animation structure (rect/text counts, timing, label list); `svgChartPairs` extracts each bar's `(label, percent)` from the SVG's alternating `<text>` nodes; `dataTableTopRows` reads the corresponding rows from the on-page data table; `expectEveryParametrChartMatchesTableAndIsDistinct` walks every Parametr option, asserts each option's visible text matches the pinned `ParameterOption.label` up-front, then asserts chart=table top-N for every dimension within the tolerance defined in `svg-chart-percent.util.ts` (chart label = `cells[1]` in normal mode; chart label = row Lp when `ParameterOption.chartLabelIsRank` is set, because `/zone/stats/` substitutes rank numbers for the long-text dimensions `strona`, `odsylacz`, `host`, `http_user_agent` to keep the chart legible), and asserts each dimension renders a distinct chart (compared on table labels, since the rank-number substitution would otherwise make those four dimensions look identical). Both spec files reuse these helpers so neither duplicates the chart-load wait, the SVG/table parsing, or the per-Parametr coverage loop
- `utils/svg-chart-percent.util.ts` — Pure helpers for comparing the SVG chart's percentage labels against the data table's percentage cells: `stripSvgPercentBrackets` converts the chart's `[39.67%]` form to the table's `39.67%`; `chartTablePercentGapHundredths` returns the absolute integer-hundredths gap between the two sides; `CHART_TABLE_TOLERANCE_HUNDREDTHS = 5` is the maximum acceptable per-row gap (±0.05 pp) — the chart and table render from independent sub-requests (`<object>` → `chart.php` / `chart_all.php` for the SVG, the page itself for the table) and round/truncate the percentage independently because the page must validate as XHTML 1.0 Strict, which forbids inline `<svg>` for the vintage browsers Orwell Stat still serves; empirically observed gaps reach 4 hundredths on Mobile Chrome and Webkit (see #382). Split out of `svg-chart.util.ts` so the node-native unit suite can import them without dragging in the Playwright fixture path aliases (mirrors the `css-validator.util.ts` precedent)
- `utils/svg-chart-percent.util.test.ts` — `node:test` unit suite for `stripSvgPercentBrackets`, `chartTablePercentGapHundredths`, and the `CHART_TABLE_TOLERANCE_HUNDREDTHS` bound, exercising identical / asymmetric / empirically-observed (4 hundredths) / IEEE-754-boundary cases for the gap math, and confirming the bound admits gaps up to 5 hundredths but rejects a synthetic 0.10 pp divergence so the wider tolerance does not mask real regressions; runs via `npm run test:unit` locally and on every PR through `playwright-typescript-lint.yml`
- `utils/validation.util.ts` — `expectValidXhtml(request, xhtml)` validates XHTML 1.0 Strict against the DTD. Default path shells out to local `xmllint --valid --noout` (libxml2, installed via `apt install libxml2-utils` in CI) — no network traffic, no authenticated HTML POSTed to a third party. Remote path (`VALIDATE_REMOTE=true`) POSTs to the classic W3C Markup Validation Service (`validator.w3.org/check`) and asserts no errors; kept available for a periodic official cross-check (the classic W3C validator is correct for XHTML 1.0 Strict; Nu is HTML5-only and gives false positives). `expectValidCss(request, cssUrl)` validates stylesheets against CSS standards. Default path fetches the stylesheet and runs `csstree-validator` locally (offline, no dependency on the W3C jigsaw service which has flaked with 403/429/5xx on CI — see #340) and asserts no errors, emitting a per-line `CSS errors in ${cssUrl}:` report on failure. Remote path (`VALIDATE_REMOTE=true`) queries `jigsaw.w3.org/css-validator` by URI for the official cross-check
- `utils/track-hit.util.ts` — `fireTrackingHit(page, baseURL, variant, testInfo)`: seeds one identifiable tracking hit by reading the live snippet from `/zone/scripts/`, materialising the matching `test-data/scripts/tracking-{html5,html4}.html|tracking.xhtml` shell with that snippet, navigating Playwright to the resulting `file://` URL with a `randomUUID()` `?run=` marker, and waiting for the tracking request to fire against `${baseURL}/scripts/`. Returns the run marker so callers can locate the resulting row in `/zone/hits/`. Both `zone-scripts.spec.ts` (asserts the hit registers) and `zone-hits.spec.ts` (uses the hit as a known-value source for the filter form) reuse this primitive instead of duplicating the seeding flow. Also exports `TRACKING_FIXTURES` (the three variant descriptors) and `TEST_DATA_BASE` (the `test-data/scripts/` URL, shared with the canonical-snippet reader in `zone-scripts.spec.ts`).
- `utils/env.util.ts` — `loadEnv(importMetaUrl, levelsUp)` loads `.env` relative to the calling file; `requireCredentials(account?: 'populated' | 'empty')` validates and returns the correct credentials for the requested account, defaulting to populated. The populated account reads `ORWELLSTAT_USER` / `ORWELLSTAT_PASSWORD`; the empty account requires `ORWELLSTAT_USER_EMPTY` / `ORWELLSTAT_PASSWORD_EMPTY`. Throws a descriptive error if either pair is missing. `requireRealEmail()` returns `ORWELLSTAT_EMAIL` (the real address currently stored on the populated account) and is used by the zone-admin mutating-settings tests as the anchor for their post-test restore — see #397.
- `utils/diagnosis.util.ts` — `attachAiDiagnosis(testInfo, logs, domContent)`: calls the configured AI provider (Anthropic or Gemini, selected by `AI_PROVIDER`) to produce a diagnosis and optional selector-fix attachment on test failure; model names default to a per-provider map but can be overridden via `AI_MODEL_FAST` (diagnosis) and `AI_MODEL_STRONG` (selector fix); pipes the DOM snapshot, console logs, and error messages through `redactSensitive()` before they cross the provider boundary; the `REDACT_PATTERNS` array is the authoritative source — see [SECURITY.md — AI diagnosis data egress](SECURITY.md#ai-diagnosis-data-egress) for the full pattern list (cookie / set-cookie / multi-pair cookie / bearer / x-api-key / query-string apikey · token / JWT / email); no-ops when `AI_DIAGNOSIS=true` is absent or the provider's API key is missing; errors are caught and warned so diagnosis never fails a test
- `utils/diagnosis.util.test.ts` — `node:test` unit suite for `redactSensitive`, co-located with `diagnosis.util.ts`, exercising every `REDACT_PATTERNS` rule (cookie / set-cookie / multi-pair cookie / bearer / x-api-key / query-string apikey · token / JWT / email) plus mixed / no-match / char-budget / XHTML-structure / multi-line / order-sensitivity / per-rule bypass-attempt cases (case variants, whitespace variants, mixed quoting, length-threshold guards); runs via `npm run test:unit` locally and on every PR through `playwright-typescript-lint.yml`
- `utils/css-validator.util.ts` — pure helpers around `csstree-validator` (`getCssErrors`, `formatCssErrors`) used by `expectValidCssLocal`; split out of `validation.util.ts` so they are importable from the node-native unit suite without dragging in the Playwright fixture path aliases
- `utils/css-validator.util.test.ts` — `node:test` unit suite for `getCssErrors` and `formatCssErrors`, proving that intentionally broken CSS (invalid property values, unknown properties, unknown at-rules, aggregated across lines) still reports per-line errors with line numbers and the source URL; runs via `npm run test:unit` locally and on every PR through `playwright-typescript-lint.yml`
- `types/` — Shared TypeScript interfaces; exported via path alias `@types-local/*`
  - `svg-analysis.ts` — `SvgAnalysis` interface: shape of the object returned by `page.evaluate()` in `statistics.spec.ts`
  - `statistics-row.ts` — `StatisticsRow` interface: shape of each data row returned by the bulk `page.evaluate()` in `statistics.spec.ts`
  - `csstree-validator.d.ts` — ambient module declaration for `csstree-validator` (which ships no types), covering the `validateString(css, filename?)` entry point and the `CssValidationError` shape consumed by `utils/css-validator.util.ts`
- `test-data/` — Static test data committed with the test suite
  - `scripts/snippet-html5.txt`, `scripts/snippet-html4.txt`, `scripts/snippet-xhtml.txt` — single source of truth for the HTML5 / HTML4 / application/xhtml+xml tracking-snippet bodies. Both the structural assertion in `tests/zone-scripts.spec.ts` and the tracking fixtures read from these files; each uses `{{ORWELLSTAT_BASE}}` in place of the server origin so the same snippets work against production and staging. If the product changes a snippet on `/zone/scripts/`, refresh the matching `snippet-*.txt` file — the structural test fails first, giving a clear signal.
  - `scripts/tracking-html5.html`, `scripts/tracking-html4.html`, `scripts/tracking.xhtml` — thin HTML / HTML4 / XHTML shells with a `{{SNIPPET}}` placeholder that `tests/zone-scripts.spec.ts` fills with the matching `snippet-*.txt` at runtime before navigating Playwright to the resulting `file://` URL.
- `coverage-matrix.json` — Manual test coverage matrix: lists all known testable pages and forms with boolean flags per category (`title`, `content`, `accessibility`, `visualRegression`, `api`, `securityHeaders`, `negativePath`, `tracking`). `activePageCategories` declares which page categories currently count in summaries/trends, `defaultApplicablePageCategories` declares which of those active categories apply to an ordinary page by default, and `pageApplicableCategories` narrows or extends specific routes where needed (for example `/scripts/*.php` is a tracker contract, not a page, so only `tracking` applies there). `pageNotes` documents wildcard or non-page-like entries such as `/scripts/*.php`, which represents the public tracker contract exercised by `fireTrackingHit()`. Updated by hand when new tests are added or new pages/forms are introduced to the application; read by the Test Coverage Trends workflow to calculate and display coverage percentages, and by `scripts/verify-coverage-matrix.ts` to fail CI when the matrix drifts out of sync with what the specs actually cover (see the **Verify Coverage Matrix** workflow below)
- `scripts/verify-coverage-matrix.ts` — Cross-references active tests in `tests/` against `coverage-matrix.json` and exits non-zero on drift. Recognises `test(...)` and `test.describe(...)` calls (excluding `test.fixme(...)`, `test.skip(name, ...)`, and conditional `test.skip(fn, msg)` browser-gates) and applies hardcoded mapping rules per category (e.g. `accessibility` is covered iff `accessibility.spec.ts` has an active `test(PageClass.url, ...)` for that URL). Current additional signals: `negativePath` is inferred from explicit empty/error/zero-result assertions, `tracking` from specs that call the shared tracker primitive, while `securityHeaders` can remain present-but-inactive until a dedicated rule/test is added and `activePageCategories` opts it into summary math. Run locally via `npm run verify:matrix`. Unit-tested in `scripts/verify-coverage-matrix.test.ts` against synthetic fixtures (false-positive, false-negative, in-sync, matrix-edit regression, parser edge cases). When a new spec or category is introduced, update both the matrix AND the rule list in this script in the same PR — the unit tests will fail otherwise.
- `scripts/redact.ts` — Tiny stdin → stdout CLI invoked by `scripts/self-healing.py` to mask cookies, bearer tokens, and email local-parts in `error-context.md` / `dom.xhtml` before they reach the LLM provider. Re-uses `redactSensitive` from `utils/diagnosis.util.ts` so the regex set stays a single source of truth across the TS and Python paths. Unit-tested end-to-end (real subprocess, real stdin/stdout) in `scripts/redact.test.ts`.

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
- All browser projects default to `storageState: '.auth/populated.json'` (populated account). Specs asserting empty-state UI opt in per file via `test.use({ storageState: EMPTY_STORAGE_STATE })` from `@fixtures/storage-state`. The `authenticatedRequest` API fixture inherits the populated `storageState`; tests needing an unauthenticated session use `unauthenticatedRequest` instead. Never branch at runtime on which account is logged in.
- On failure: screenshots, video, and console/DOM log attachments are saved
- `trace: 'on-first-retry'`
- `baseURL` is driven by the `ENV` variable (`production` by default, `staging` when `ENV=staging`); `httpCredentials` are injected automatically when `BASIC_AUTH_USER` is set
- `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01 }` — global threshold for visual regression tests
- `snapshotPathTemplate` includes `{platform}` so macOS (`-darwin`), Linux (`-linux`), and Windows (`-win32`) each have their own baselines; macOS baselines are committed from local runs, Linux baselines are generated via the CI workflow; Windows is not officially supported for local baseline generation — use the CI workflow instead

**CI:** `.github/workflows/playwright-typescript.yml` — runs on push/PR to main/master with `working-directory: playwright/typescript`; gated only by `vars.PLAYWRIGHT_TYPESCRIPT == 'true'` (kill switch); uses a matrix strategy (`fail-fast: false`) to run each of the 5 browser projects (Chromium, Firefox, Webkit, Mobile Chrome, Mobile Safari) sharded across **2 parallel legs each** (10 legs total); each matrix entry calls the **reusable workflow** `.github/workflows/playwright-run.yml` (`on: workflow_call:`) which encapsulates the full per-shard job: checkout → install Node + browser + xmllint → download auth state → run tests (`--no-deps`) → upload reports / baselines / self-healing data. Before the test matrix fans out, a separate `auth-setup` job runs `npx playwright test --project=setup` **once per project** (5 parallel legs × 2 accounts = 10 logins per workflow run, independent of shard count) and uploads each project's `.auth/{populated,empty}.json` as `auth-state-<id>` (`retention-days: 1`); the test matrix `needs: [setup-matrix, auth-setup]` so an auth-setup failure skips downstream legs instead of letting them silently pass. This restores the pre-#412 staging-side auth load (10 logins/run regardless of how the matrix is sharded) and avoids re-authenticating on every shard (#472). The reusable workflow accepts the matrix entry (`project`, `browser`, `id`, `snap-token`, `shard`, `total-shards`) plus run-shape inputs (`update-visual-baselines`, `env`, `runner`, `ref`) and inherits secrets via `secrets: inherit`. Each leg installs only the browser it needs (`chromium`, `firefox`, or `webkit`) and runs `npx playwright test --project=<project> --shard=<shard>/<total-shards>` so half the spec set runs per leg; per-leg artifacts use a `-<id>-<shard>` suffix (`playwright-report-<id>-<shard>`, `blob-report-<id>-<shard>`, `self-healing-data-<id>-<shard>`, `visual-baselines-linux-<id>-<shard>`) and are retained 30 days. A `merge-reports` job runs after all legs finish (using `always()` so a partial failure still surfaces) — it downloads every `blob-report-*` artifact with `merge-multiple: true` and runs `npx playwright merge-reports --reporter=html` to publish a unified `playwright-report-merged` artifact covering the full spec set; the same blob format powers the flaky-test detection workflow described in [Running tests](#running-tests). npm dependencies are cached via `actions/setup-node` `cache: 'npm'` keyed on `package-lock.json`, and the `~/.cache/ms-playwright` browser cache is restored via `actions/cache@v4` keyed on `{runner.os, browser, hashFiles('playwright/typescript/package-lock.json')}` so the ~600 MB browser tarball is reused across runs and shards (skips download on cache hit, falls back to a full `install --with-deps` on miss); the cache key changes whenever `@playwright/test` is bumped in `package-lock.json` so version drift can't leave stale binaries. Upload is skipped when running locally with `act`. A workflow-level `concurrency` group (`${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`) cancels any in-progress run for the same ref when a new commit arrives, saving CI minutes on rapid pushes; this also affects manual `update_visual_baselines` dispatches — pushing to the same branch while a baseline-commit run is in flight will cancel it (safe to re-dispatch). The `test` job references a **GitHub Environment** (`staging` by default, `production` when selected via `workflow_dispatch`) — this scopes `vars.ENV` and any environment-scoped secrets to that environment and records a deployment entry in the repo's Environments tab; `production` has a required-reviewer protection rule. **Behavior change (2026-04):** push/PR/schedule runs now target `staging` (previously the Playwright config defaulted to production when `ENV` was unset); production-targeting requires a manual `workflow_dispatch` with `env=production`. Also supports `workflow_dispatch` with five inputs: `env` (choice: `staging` / `production`; defaults to `staging` — selects the GitHub Environment and drives `vars.ENV` into Playwright and Bruno), `project` (choice: `all` / `chromium` / `firefox` / `webkit`; defaults to `all` — a `setup-matrix` job computes the matrix at runtime so only matching browser entries run; selecting `chromium` also runs Mobile Chrome, `webkit` also runs Mobile Safari), `update_visual_baselines` (boolean, regenerates Linux baselines for all 5 browser projects via `--update-snapshots` — sharding is collapsed to `total-shards=1` for this path so each project runs as a single leg, uploads `visual-baselines-linux-<id>-1`, and the `commit-baselines` job downloads all five with `merge-multiple: true` before committing), `ref` (branch to run on; defaults to triggering branch), and `runner` (free-text override — leave empty to use the `RUNNER` repo variable; push/PR/schedule always use `vars.RUNNER` or fall back to `ubuntu-latest`). To generate Linux baselines for a feature branch: Actions → "Playwright Typescript Tests" → "Run workflow" → enter the branch name in `ref`, check `update_visual_baselines`.

**Real-credential isolation:** `.github/workflows/playwright-real-credential.yml` — runs the single `tests/zone-admin.spec.ts` → "admin page - password mismatch (real credential)" regression in isolation under `playwright.config.real-credential.ts`, which sets `retries: 0` and `trace`/`screenshot`/`video: 'off'` so the form-encoded POST body that carries `ORWELLSTAT_PASSWORD` to the server's `new == confirm` branch cannot be captured in any published artefact on a CI flake (see #410). The companion guard in the spec file (`test.skip(process.env.REAL_CREDENTIAL_RUN !== 'true', ...)` — only the literal `'true'` opens the gate) keeps the test out of the standard `playwright-typescript.yml` matrix; this dedicated workflow is the only place it runs. Same triggers as the standard workflow (push/PR/schedule/`workflow_dispatch`) and the same kill switch (`vars.PLAYWRIGHT_TYPESCRIPT == 'true'`); single Chromium project (the mismatch error is server-rendered and browser-agnostic). Uploads the HTML report only — there are no trace, screenshot, video, blob, or self-healing artefacts to publish because the dedicated config disables them at the source.

**Lint and type-check backstop:** `.github/workflows/playwright-typescript-lint.yml` — runs on push/PR to main/master **only when the diff touches `playwright/typescript/**`or the workflow file itself** (workflow-level`paths`filter); a single`lint-and-types` job (`timeout-minutes: 5`) runs `actions/checkout@v6`→`actions/setup-node@v6` (`node-version: lts/\*`, npm cache keyed on `playwright/typescript/package-lock.json`) → `npm ci`→`npm run format:check`→`npx tsc --noEmit`. Acts as the non-bypassable backstop to the local husky pre-commit hook (see the **Pre-commit hook** section under [playwright/typescript](#playwrighttypescript)) — `git commit --no-verify`cannot escape it. The job is gated by`github.repository == 'hubertgajewski/orwellstat' && vars.PLAYWRIGHT_TYPESCRIPT == 'true'`, matching the sibling test workflow's kill switch. **Branch protection note:** add `lint-and-types`to the required status checks on`main`(Settings → Branches → Branch protection rules →`main`) so failing lint/type runs block merge — the workflow runs automatically on every qualifying PR, but GitHub's merge block is configured separately.

**Standalone baseline update:** `.github/workflows/update-visual-baselines.yml` — `workflow_dispatch`-only workflow that regenerates Linux baselines for all 5 browser projects and commits them back directly; accepts a `branch` input (defaults to `main`) and a `runner` text input (leave empty to use `vars.RUNNER`). Always dispatch against a feature branch (not `main`) — `GITHUB_TOKEN` can push to unprotected branches, so the updated snapshots land on your branch and the open PR picks them up automatically. Use this when you want to regenerate baselines without running the full test suite.

**Automated code review:** `.github/workflows/claude-code-review.yml` — triggers on pull request events (opened, synchronize, ready_for_review, reopened); runs `anthropics/claude-code-action@v1` to review the PR and submit a formal GitHub review via `gh pr review` (Approved / Changes Requested / Commented), making the bot appear in the PR Reviewers section with a status badge; uses inline comments for specific code issues; focuses on Playwright test correctness, POM conventions, TypeScript quality, and consistency.

The workflow uses a **two-tier retry strategy** to balance cost against reliability — chosen in #293 over the simpler "swap to native Sonnet everywhere" option because it keeps the cheap path as the default and only pays the premium when the cheap path actually no-ops:

1. **Primary run — OpenRouter Minimax preset** (or whichever model `ANTHROPIC_BASE_URL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` resolve to in repo variables). Measured at ~$0.038/run on PR #241 — ~7.6× cheaper than native Sonnet 4.6 on substantive diffs. Minimax occasionally skips the mandated `gh pr review` call on trivial diffs (e.g. `.gitignore`, typo-only edits) — the documented failure mode of weaker proxy models on this workflow (see #284, #293).
2. **Fallback run — native Anthropic Sonnet 4.6** (`claude-sonnet-4-6`). Only fires when the primary action succeeded but `claude[bot]` posted zero reviews at `HEAD_SHA`. Measured at ~$0.29/run on PR #241, used only for no-op cases. Expected net cost = primary cost + (no-op rate × fallback cost). Requires the `ANTHROPIC_API_KEY` secret in addition to `OPENROUTER_API_KEY`. Uses the same review criteria and steps as the primary — only the signature line differs so the Backfill step can tell them apart.

Post-steps: `Backfill review signature` appends the `_Reviewed by …_` signature to whichever review was posted if the model forgot. `Fail if no review was posted` runs after both tiers have had a chance — it fails the job only when neither tier produced a review at `HEAD_SHA`, preventing the silent-mandate-skip failure mode (#284) from reaching `main`. It is skipped when the primary action itself failed (e.g. 401 on a self-workflow-edit PR) so the primary error stays the single signal.

**Test Coverage Trends:** `.github/workflows/test-coverage.yml` — runs on push to main when `coverage-matrix.json` or any file under `tests/` changes, and on `workflow_dispatch`; reads `playwright/typescript/coverage-matrix.json` and outputs a coverage percentage table to the GitHub Actions step summary. Coverage is measured as a **manual matrix** — not code coverage — because there is no access to the backend source. The matrix lists all known testable items (pages × categories: `title`, `content`, `accessibility`, `visualRegression`, `api`, `securityHeaders`, `negativePath`, `tracking`; plus interactive forms) and each entry is a boolean reflecting whether a spec currently exercises that combination. Summary math uses `activePageCategories`, ordinary page defaults come from `defaultApplicablePageCategories`, and route-specific exceptions use `pageApplicableCategories`, so placeholder or non-page-only categories do not dilute the headline percentage before the repo is ready to measure them. Signal conventions: `securityHeaders` requires an explicit header or cookie-flag assertion, `negativePath` requires an error/empty/validation-path assertion, and `tracking` requires exercise of the `/scripts/` tracker contract. (`i18n` and `mobile` are deliberately omitted: the app is single-locale and has no distinct mobile UI; mobile execution coverage is already provided by Playwright's mobile projects.) When a new test covers a previously uncovered item, flip the value in `coverage-matrix.json` from `false` to `true`; if a new category becomes reportable, add it to `activePageCategories` and, if it should apply to ordinary pages, to `defaultApplicablePageCategories` (or to `pageApplicableCategories` for route-specific exceptions). When a new page or form is added to the application, add a new entry to the matrix so it appears as a gap (all `false`) until tests are written.

**Verify Coverage Matrix:** `.github/workflows/verify-coverage-matrix.yml` — runs on PRs and pushes that touch `coverage-matrix.json`, anything under `playwright/typescript/tests/`, or the verifier script itself. Executes `npm run verify:matrix`, which fails non-zero with a per-cell diff when the matrix's claims do not match the active-test inventory. The two failure modes are listed in the script output: **false-positive** (matrix claims `true` but no covering test exists — typically a forgotten matrix update after a test was deleted or a stale boolean) and **false-negative** (an active test covers a cell the matrix has as `false` — typically a forgotten flip after adding a new test).

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

**Self-Healing Selector Fix:** `.github/workflows/self-healing.yml` — triggers via `workflow_run` after "Playwright Typescript Tests" completes with a failure; detects selector/locator errors in the test results and proposes fixes. When a PR's tests fail due to a broken selector, posts a comment on the PR with the fix suggestion. When tests on `main` or a schedule run fail, creates a draft PR applying the fix. The workflow uses pre-computed `selector-fix.md` attachments when `AI_DIAGNOSIS` is enabled, or falls back to calling the AI provider (Anthropic/Gemini, configured via `AI_PROVIDER`) directly with the DOM snapshot. Before the fallback ships `error-context.md` and `dom.xhtml` to the LLM provider, `scripts/self-healing.py` shells out to `playwright/typescript/scripts/redact.ts` (which re-uses `redactSensitive` from `utils/diagnosis.util.ts`) so cookies, bearer tokens, and email local-parts captured in failure traces are masked at the read boundary; subprocess failure raises and aborts the run rather than falling back to sending unredacted content. Requires `SELF_HEALING=true` in repository variables. Loop prevention is enforced via five layers: branch name guard (skips `fix/self-healing-*` branches), max 2 comments per PR, draft PR deduplication, per-branch concurrency groups, and failure-only triggering. As a separate defense-in-depth layer, the `if:` gate also refuses fork-originated `workflow_run` triggers (`github.event.workflow_run.head_repository.full_name == github.repository`) — rejecting at the trigger means the self-healing job is skipped before any step executes for fork-PR runs. The script (`scripts/self-healing.py`) has a comprehensive unit test suite (`scripts/test_self_healing.py`) covering all loop prevention scenarios.

The script enforces two safety gates against malformed or hostile AI output: (1) `_parse_ai_response` rejects any `suggestedSelector` that does not match a Playwright-locator-shape allow-list (`getBy*(...)` / `locator(...)` / `frameLocator(...)` with chained `.first/.last/.nth/.filter/.getBy*/.locator(...)`), or that exceeds 500 chars, or that contains code-injection markers (`\n`, backtick, `;`, `>`, `$(`) — the run terminates fast and no source file is opened for writing; (2) `_apply_selector_fix` performs only an exact-substring replace and raises `SelectorReplaceError` on miss, rather than falling back to a fuzzy regex that could match across method-chain boundaries and mutate unrelated code. Multi-line chain repair is therefore out of scope for the auto-fix path — the bot reports the miss on stderr and a human handles it.

---

## MCP servers

Five MCP servers are declared in `.mcp.json` and loaded automatically by any MCP-compatible AI assistant opened from the repo root. All five are loaded automatically — no local setup needed beyond having Node.js and Docker installed (and a one-off `npm install && npm run build` in `mcp/shared/` followed by the same in `mcp/quality-metrics/` and `mcp/coverage-matrix/` for the local servers; both consumers depend on the shared package via a `file:../shared` path, so it must be built first).

| Server                | Key in `.mcp.json`      | Purpose                                                                           |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| playwright-report-mcp | `playwright-report-mcp` | Run Playwright tests and retrieve structured results                              |
| playwright (browser)  | `playwright`            | Live browser automation — navigate, click, screenshot, snapshot                   |
| Docker MCP gateway    | `MCP_DOCKER`            | Interact with Docker containers (used with `act` for local CI)                    |
| quality-metrics       | `quality-metrics`       | Query defect escape rate, MTTR, and metrics history (local, no deployment)        |
| coverage-matrix       | `coverage-matrix`       | Query and update `playwright/typescript/coverage-matrix.json` through typed tools |

### playwright-report-mcp

An MCP server that runs the Playwright test suite and returns structured JSON results, enabling agentic workflows (self-healing, test generation verification) to act on test outcomes without parsing shell output.

**Setup:** No setup required — runs via `npx playwright-report-mcp@3.1.0` from the official npm registry. The version is pinned in `.mcp.json` so upstream releases don't silently change behavior between runs.

**Configuration:** Each tool call accepts an optional `workingDirectory` argument naming the Playwright project directory; the `PW_ALLOWED_DIRS` environment variable in `.mcp.json` defines which paths that argument is allowed to resolve to:

| Setting             | Where                | Default | Description                                                                                                                                                                                                                                              |
| ------------------- | -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workingDirectory`  | per tool-call arg    | `"."`   | Playwright project directory, absolute or relative to the MCP server launch directory (the repo root). The default `.` points at the repo root, which has no `playwright.config.*` and will fail — every call must pass an explicit `workingDirectory`. |
| `PW_ALLOWED_DIRS`   | `.mcp.json` env var  | unset   | Colon-separated allowlist of directories `workingDirectory` is permitted to resolve under. This repo sets `".."` (the repo root's parent) so sibling worktrees like `../orwellstat-<N>/playwright/typescript` are reachable.                              |

This repo sets `PW_ALLOWED_DIRS` to `..` so the repo root's parent and every sibling worktree under it are reachable from a single allowlist entry:

```json
"playwright-report-mcp": {
  "command": "npx",
  "args": ["--min-release-age=0", "playwright-report-mcp@3.1.0"],
  "type": "stdio",
  "env": {
    "PW_ALLOWED_DIRS": ".."
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

**Setup:** Build the shared helpers first, then this server — `(cd mcp/shared && npm install && npm run build) && (cd mcp/quality-metrics && npm install && npm run build)`. The server runs via `node mcp/quality-metrics/dist/index.js` as configured in `.mcp.json`.

`get_defect_escape_rate` and `get_mttr` shell out to `scripts/generate-quality-metrics.py --json`, so the values returned are guaranteed to match `QUALITY_METRICS.md`. Requires `gh` to be authenticated locally (the default in a developer session).

| Tool                     | Description                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `get_defect_escape_rate` | Return escape rate percentage and bug counts per discovery label (`found-by-test`, `found-by-manual-testing`, `found-in-production`) |
| `get_mttr`               | Return mean time to resolve for all closed bug issues, and broken down per discovery label                                           |
| `get_metrics_history`    | Return all historical data points from `quality-metrics-history.json` as structured JSON                                             |

When no `bug`-labeled issues exist, all three tools return a clear `"No bug issues found"` message instead of dividing by zero or throwing.

### coverage-matrix

Local MCP server in `mcp/coverage-matrix/` that exposes structured access to `playwright/typescript/coverage-matrix.json`. Lets `/generate-test`, `/generate-stubs`, and other agentic workflows query gaps and percentages through typed tools instead of parsing JSON by hand, and supports user-directed flips of a covered cell with input validation.

**Setup:** Build the shared helpers first, then this server — `(cd mcp/shared && npm install && npm run build) && (cd mcp/coverage-matrix && npm install && npm run build)`. The server runs via `node mcp/coverage-matrix/dist/index.js` as configured in `.mcp.json`.

The summary percentages match those produced by the **Test Coverage Trends** workflow (`.github/workflows/test-coverage.yml`) since both compute `round(covered / total * 100)` over the same matrix sections. `mark_covered` writes the file back with the same 2-space JSON formatting and trailing newline as the existing matrix; it does not flip forms (the matrix's `forms` section is read-only via these tools).

| Tool                   | Description                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_coverage_gaps`    | Return uncovered entries: pages grouped by URL with their missing categories (excluding `title` and `api`, and also excluding inactive or page-inapplicable categories), plus uncovered form names |
| `get_coverage_summary` | Return covered/total counts and percentages per category (`title`, `content`, `accessibility`, `visualRegression`, `api`, `securityHeaders`, `negativePath`, `tracking`), plus forms and overall; inactive categories report `0/0` until activated in the matrix |
| `mark_covered`         | Flip one page-category entry to `true` and persist the file. Returns a descriptive error (not an exception) when the page URL is unknown, the category invalid, or the category is not applicable for that page |

Valid categories for `mark_covered`: `title`, `content`, `accessibility`, `visualRegression`, `api`, `securityHeaders`, `negativePath`, `tracking`.

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

**CI:** `.github/workflows/bruno.yml` — runs on push/PR to main/master and `workflow_dispatch`; gated only by `vars.BRUNO == 'true'` (kill switch); a workflow-level `concurrency` group (`${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`) cancels any in-progress run for the same ref when a new commit arrives; writes secrets (including `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` for staging) into `bruno/.env`, runs `bru run --env "$ENV"` driven by `vars.ENV`, then removes `.env` in a `Cleanup credentials` step (`if: always()`) so no plaintext credentials remain on the runner filesystem after the job. The `test` job references a **GitHub Environment** (`staging` by default, `production` when selected via `workflow_dispatch`) — this scopes `vars.ENV` and environment-scoped secrets and records a deployment entry in the repo's Environments tab; `production` has a required-reviewer protection rule. **Behavior change (2026-04):** push/PR/schedule runs now target `staging` (previously hardcoded `--env production`); production-targeting requires a manual `workflow_dispatch` with `env=production`. Supports `workflow_dispatch` with two inputs: `env` (choice: `staging` / `production`; defaults to `staging`) and `runner` (free-text override — leave empty to use `vars.RUNNER`) for routing to a local self-hosted runner.

---

## Self-hosted runner and local CI

For self-hosted runner setup (single and multi-worker), routing configuration, security model, and running workflows locally with `act` (requirements, usage, Docker RAM requirements, per-workflow compatibility), see [docs/CI_LOCAL.md](docs/CI_LOCAL.md).
