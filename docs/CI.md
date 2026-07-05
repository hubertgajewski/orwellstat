# CI Workflows

This file owns GitHub Actions workflow behavior: triggers, gates, inputs, runner selection, artifacts, and safety notes. For local `act` and self-hosted runner setup, see [CI_LOCAL.md](CI_LOCAL.md).

Most workflows are gated by repository variables documented in [CONFIGURATION.md](CONFIGURATION.md). Push/PR/schedule runs default to staging where applicable; production-targeting requires manual `workflow_dispatch` with `env=production`.

## Workflow Summary

| Workflow                         | Purpose                                                         | Gate                              |
| -------------------------------- | --------------------------------------------------------------- | --------------------------------- |
| `playwright-typescript.yml`      | Full Playwright browser matrix                                  | `PLAYWRIGHT_TYPESCRIPT == 'true'` |
| `playwright-run.yml`             | Reusable per-browser/per-shard Playwright job                   | Called by other workflows         |
| `playwright-real-credential.yml` | Isolated real-password mismatch test                            | `PLAYWRIGHT_TYPESCRIPT == 'true'` |
| `playwright-typescript-lint.yml` | Formatting, TypeScript, and unit-test backstop                  | `PLAYWRIGHT_TYPESCRIPT == 'true'` |
| `update-visual-baselines.yml`    | Regenerate and commit Linux visual baselines                    | manual dispatch                   |
| `bruno.yml`                      | Bruno API request collection                                    | `BRUNO == 'true'`                 |
| `claude-code-review.yml`         | Automated PR code review                                        | `AI_REVIEW == 'true'`             |
| `test-coverage.yml`              | Manual coverage-matrix summary                                  | none beyond trigger               |
| `verify-coverage-matrix.yml`     | Drift check between specs and coverage matrix                   | `PLAYWRIGHT_TYPESCRIPT == 'true'` |
| `mcp-tests.yml`                  | Local MCP server package tests                                  | path trigger                      |
| `quality-metrics.yml`            | Defect escape rate, MTTR, and generated metrics report          | `QUALITY_METRICS == 'true'`       |
| `self-healing.yml`               | Selector-fix comments or draft PRs after failed Playwright runs | `SELF_HEALING == 'true'`          |

## Runner Selection

Jobs that support runner selection resolve their runner as:

```text
inputs.runner || vars.RUNNER || 'ubuntu-latest'
```

Use [CI_LOCAL.md](CI_LOCAL.md) for self-hosted runner setup, security model, and local `act` commands.

## Automation Scripts

Root scripts support CI workflows, hooks, and generated reports:

| Script                                                      | Purpose                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `scripts/generate-quality-metrics.py`                       | Generates `QUALITY_METRICS.md` and appends `quality-metrics-history.json` data points                                  |
| `scripts/self-healing.py`                                   | Parses Playwright failure artifacts and posts selector-fix comments or creates draft PRs                               |
| `scripts/provision-worktree-env.sh`                         | Symlinks or copies gitignored env files into per-issue worktrees                                                       |
| `scripts/setup-runners.sh`                                  | Registers and starts the self-hosted runner pool as launchd services                                                   |
| `scripts/remove-runners.sh`                                 | De-registers and stops the self-hosted runner pool                                                                     |
| `scripts/runner-lib.sh`                                     | Shared helpers for the self-hosted runner setup/removal scripts                                                        |
| `scripts/verify_commit_command_hook.py`                     | Shared pinned-hook check that verifies direct `git push` commands and rejects wrapped push forms                       |
| `scripts/test_generate_quality_metrics.py`                  | Unit tests for generated quality-metrics behavior                                                                      |
| `scripts/test_self_healing.py`                              | Unit tests for self-healing loop prevention, classification, redaction, and AI boundaries                              |
| `scripts/test_runner_scripts.py`                            | Unit tests for self-hosted runner setup/removal scripts                                                                |
| `scripts/run_pinned_hook.sh`                                | Shared pinned-hash launcher for Claude/Codex PreToolUse hook scripts                                                   |
| `scripts/shell_c_option_utils.py`                           | Shared `-c` / clustered short-option parsing helpers for hook scripts                                                  |
| `scripts/verify_playwright_cli_hook.py`                     | Pinned PreToolUse helper that blocks direct Playwright CLI invocations and directs agents to `playwright-report-mcp`   |
| `scripts/test_playwright_cli_hook.py`                       | Unit tests for the Playwright CLI hook script                                                                          |
| `scripts/test_commit_hook_config.py`                        | Unit tests for Claude/Codex publish-time and Playwright CLI PreToolUse hook configuration                              |
| `playwright/typescript/scripts/collect-failure-evidence.ts` | Builds an indexed failure-evidence artifact from Playwright `test-results/results.json` and failed-attempt attachments |

## Playwright Typescript Tests

`.github/workflows/playwright-typescript.yml` runs on push/PR to `main`/`master`, Sunday schedule, and `workflow_dispatch`. It uses `working-directory: playwright/typescript` and is gated by `vars.PLAYWRIGHT_TYPESCRIPT == 'true'`.

Run shape:

- Matrix strategy with `fail-fast: false`.
- Five browser projects: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari.
- Two shards per project, for 10 parallel test legs.
- A `setup-matrix` job computes the matrix at runtime for full or browser-filtered dispatch runs.
- An `auth-setup` job runs the setup project once per browser project before the test matrix fans out.
- The `test` matrix calls reusable workflow `.github/workflows/playwright-run.yml`.
- `merge-reports` runs with `always()` and publishes one merged Playwright HTML report from blob artifacts.

Auth setup details:

- `auth-setup` runs `npx playwright test --project=setup` once per browser project.
- Each setup leg logs in both populated and empty accounts, so normal runs perform 10 logins total, independent of shard count.
- Auth state artifacts are named `auth-state-<id>` and retained for 1 day. Each artifact contains `.auth/populated.json`, `.auth/empty.json`, and `.auth/metadata.json` with non-secret generation time and GitHub run identifiers.
- Failed setup legs upload indexed diagnostics as `failure-evidence-auth-setup-<id>` and append the same `index.md` map to the job summary. Setup runs disable trace, screenshot, and video capture so credential-entry artifacts are not published.
- Downstream test legs depend on auth setup, so a setup failure skips tests instead of letting them pass with stale state.

Reusable test job:

- `playwright-run.yml` accepts matrix inputs (`project`, `browser`, `id`, `snap-token`, `shard`, `total-shards`) plus run-shape inputs (`update-visual-baselines`, `env`, `runner`, `ref`).
- It inherits secrets.
- Each leg normally installs only the browser it needs.
- It validates downloaded auth-state files and metadata before running the shard. Missing metadata, invalid timestamps, or metadata older than 1 hour triggers a local setup-project rerun in that leg; this protects failed-job reruns from reusing expired storage-state artifacts. Local auth regeneration reuses the shared browser setup action to install Chromium only for non-Chromium shard legs because the setup project uses Playwright's default browser.
- It runs `npx playwright test --project=<project> --shard=<shard>/<total-shards>`.
- Per-leg artifacts use `-<id>-<shard>` suffixes for reports, blob reports, failure evidence, self-healing data, and visual baselines. Report/blob uploads only run after the shard test step is reached, and failure evidence plus self-healing data are collected/uploaded only when that shard test step fails.
- Failure evidence artifacts are named `failure-evidence-auth-setup-<id>` for setup failures and `failure-evidence-<id>-<shard>` for shard failures, then retained for 30 days. Each artifact contains `index.md`, `manifest.json`, a copy of `results.json` when Playwright produced it, and failed-attempt attachments under stable paths such as `failures/F002-R0/screenshot.png`. The collector copies generated attachments from `test-results/` and visual expected-baseline attachments from `tests/**-snapshots/`; other outside paths stay blocked. The `index.md` summary assigns every failed attempt an error id, shows the artifact download command, repeats the artifact name beside every attachment path, strips terminal color codes from error messages, and avoids runner-local absolute paths. The workflow also appends `index.md` to the job summary so the first diagnostic map is visible without downloading the artifact.
- Artifacts are retained for 30 days unless otherwise noted.

Caching:

- Node uses `actions/setup-node@v6` with `node-version-file: .node-version` and `check-latest: true`.
- npm dependencies are cached by `package-lock.json`.
- `.github/actions/setup-playwright-browser` restores an isolated Playwright browser cache under `RUNNER_TEMP`.
- Browser cache keys include runner OS, runner architecture, browser, and `@playwright/test` version.
- The browser setup always runs `install-deps`, then lets `playwright install` reuse restored browsers or download missing binaries.
- Artifact upload is skipped under `act`.

Concurrency:

- Normal push/PR/schedule runs use a workflow-level group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
- Manual baseline updates use a branch-specific non-cancelling group so push-back jobs are not interrupted mid-update.

Dispatch inputs:

| Input                     | Purpose                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `env`                     | `staging` or `production`; selects GitHub Environment and drives `vars.ENV`                                 |
| `project`                 | `all`, `chromium`, `firefox`, or `webkit`; Chromium also runs Mobile Chrome, WebKit also runs Mobile Safari |
| `update_visual_baselines` | Regenerates Linux baselines for all browser projects and collapses sharding to one leg per project          |
| `ref`                     | Branch to run; defaults to triggering branch                                                                |
| `runner`                  | Free-text runner override; leave empty to use `vars.RUNNER`                                                 |

To generate Linux baselines for a feature branch, run "Playwright Typescript Tests" manually, set `ref` to the branch, and enable `update_visual_baselines`.

## Real-Credential Isolation

`.github/workflows/playwright-real-credential.yml` runs the single `zone-admin.spec.ts` password-mismatch regression under `playwright.config.real-credential.ts`.

Purpose:

- The test fills the real `ORWELLSTAT_PASSWORD`.
- The dedicated config sets `retries: 0`.
- Trace, screenshot, and video are disabled so the form-encoded POST body cannot be captured in published artifacts on a flake.
- The spec guard only opens when `REAL_CREDENTIAL_RUN === 'true'`, keeping the test out of the standard matrix.
- The workflow uploads only the HTML report; no trace, screenshot, video, blob, failure-evidence, or self-healing artifacts are produced.

## Lint And Type-Check Backstop

`.github/workflows/playwright-typescript-lint.yml` runs on push/PR to `main`/`master` when the diff touches:

- `.node-version`
- `playwright/typescript/**`
- the workflow file itself

The `lint-and-types` job runs:

```text
actions/checkout@v6
actions/setup-node@v6
npm ci
npm run format:check
npx tsc --noEmit
npm run test:unit
```

Add `lint-and-types` to required branch-protection checks on `main` so local `git commit --no-verify` cannot bypass formatting, type, or unit-test failures.

## Assistant Publish Gate

Claude and Codex run the local assistant gate at publish time, not commit time. Direct `git push` commands run the pinned `scripts/verify_commit_command_hook.py` helper before refs are published; the helper runs the TypeScript check and Prettier format check for `playwright/typescript/`. Claude additionally runs the deep review agent hook before allowing the push.

Wrapped or indirect publication commands such as `cd repo && git push`, `env git push`, alias-configured push commands, and `send-pack` are blocked with an actionable message. Local history-maintenance commands such as `git rebase origin/main`, `git rebase --continue`, `git merge`, `git cherry-pick`, and local `git commit` commands do not trigger the publish gate.

## Standalone Baseline Update

`.github/workflows/update-visual-baselines.yml` is `workflow_dispatch` only. It regenerates Linux baselines for all five browser projects and commits them back to the selected branch.

Inputs:

- `branch`: target branch, default `main`. Use a feature branch, not protected `main`.
- `runner`: optional runner override.

The workflow uses a non-cancelling concurrency group keyed by target branch so parallel refreshes queue instead of racing their push commits.

## Automated Code Review

`.github/workflows/claude-code-review.yml` runs on PR opened, synchronize, ready-for-review, and reopened events. It uses `anthropics/claude-code-action@v1` to submit a formal GitHub review with inline comments.

The workflow uses two tiers:

1. Primary run through `ANTHROPIC_BASE_URL` and model variables when configured, usually an OpenRouter preset.
2. Fallback native Anthropic Sonnet run only when the primary action succeeded but posted zero reviews at the PR head SHA.

Post-steps:

- Backfill the review signature if the model forgot.
- Fail the job only when neither tier produced a review at the current head SHA.
- Skip the no-review failure when the primary action itself failed, preserving the primary error as the signal.

## Test Coverage Trends

`.github/workflows/test-coverage.yml` runs on push to `main` when `coverage-matrix.json` or files under `tests/` change, and on `workflow_dispatch`.

Coverage is manual matrix coverage, not code coverage. The workflow reads `playwright/typescript/coverage-matrix.json` and writes a percentage table to the Actions step summary.

Matrix conventions:

- Page categories include `title`, `content`, `accessibility`, `visualRegression`, `api`, `securityHeaders`, `negativePath`, and `tracking`.
- Forms are tracked separately.
- `activePageCategories` controls what counts in current summaries.
- `defaultApplicablePageCategories` applies to ordinary pages.
- `pageApplicableCategories` handles route-specific exceptions.
- `i18n` and `mobile` are omitted because the app is single-locale and mobile execution is already covered by Playwright mobile projects.

When a new test covers an uncovered cell, flip the matching boolean to `true`. When a new page or form is added, add it to the matrix as a gap until tests cover it.

## Verify Coverage Matrix

`.github/workflows/verify-coverage-matrix.yml` runs on PRs and pushes that touch:

- `.node-version`
- `coverage-matrix.json`
- files under `playwright/typescript/tests/`
- the verifier script

It executes `npm run verify:matrix`, which fails with a per-cell diff on:

- false-positive: matrix claims `true` but no covering active test exists
- false-negative: an active test covers a cell still marked `false`

## MCP Tests

`.github/workflows/mcp-tests.yml` runs on PRs and pushes touching `mcp/**`, `.node-version`, or the workflow file.

The single `test` job builds `mcp/shared`, then fans out across `coverage-matrix` and `quality-metrics` packages to run:

```text
npm ci
npm audit --audit-level=high
npm test
```

It uses the standard per-ref concurrency group with `cancel-in-progress: true`.

## Quality Metrics Dashboard

`.github/workflows/quality-metrics.yml` runs on the first day of every month at 06:00 UTC and on `workflow_dispatch`.

It queries bug-labeled issues and computes:

- Defect escape rate = `found-in-production / (found-by-test + found-by-manual-testing + found-in-production)`.
- MTTR = average closed-at minus created-at duration for closed bug issues.

Bug issues must carry one discovery label:

| Label                     | Meaning                               |
| ------------------------- | ------------------------------------- |
| `found-by-test`           | Caught by automated tests             |
| `found-by-manual-testing` | Found manually during staging testing |
| `found-in-production`     | Reported by production users          |

The workflow runs `scripts/generate-quality-metrics.py` to regenerate [QUALITY_METRICS.md](../QUALITY_METRICS.md) and append a historical point to `quality-metrics-history.json`. It commits both files to a new branch and opens a PR.

## Self-Healing Selector Fix

`.github/workflows/self-healing.yml` triggers through `workflow_run` after "Playwright Typescript Tests" fails. It detects selector/locator failures and either comments on the PR or creates a draft PR.

Data sources:

- Uses precomputed `selector-fix.md` attachments when `AI_DIAGNOSIS` is enabled.
- Otherwise calls the configured AI provider directly with redacted error context and DOM snapshot.
- Redaction is performed by `playwright/typescript/scripts/redact.ts`, which reuses `redactSensitive` from `utils/diagnosis.util.ts`.
- Redaction subprocess failure aborts the run instead of sending unredacted content.

Loop prevention:

- Skips `fix/self-healing-*` branches.
- Limits comments to two per PR.
- Deduplicates draft PRs.
- Uses per-branch concurrency groups.
- Triggers only on failed runs.
- Refuses fork-originated `workflow_run` triggers before any step runs.

AI-output safety gates:

- `_parse_ai_response` only accepts locator-shaped `suggestedSelector` values with a strict allow-list and rejects long strings or code-injection markers.
- `_apply_selector_fix` performs exact-substring replacement and raises on miss; it does not use fuzzy regex repair.

Multi-line chain repair is out of scope for the auto-fix path. The bot reports the miss for human handling.

## Bruno Workflow

`.github/workflows/bruno.yml` is documented with the Bruno collection in [BRUNO.md](BRUNO.md).
