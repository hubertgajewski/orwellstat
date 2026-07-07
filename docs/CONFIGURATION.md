# Configuration

This file owns local setup prerequisites, `.env`, `.vars`, GitHub Actions variables, and CI secrets. Keep the example files in sync with this document:

- [`.env.example`](../.env.example)
- [`.vars.example`](../.vars.example)
- [`bruno/.env.example`](../bruno/.env.example)

## Prerequisites

| Tool                                                               | Required for                                    | Install                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v26.3.1                             | Playwright, Bruno, MCP test tooling             | [nodejs.org](https://nodejs.org/)                                               |
| [Bruno](https://www.usebruno.com/)                                 | Manual API request collection                   | Standalone app or VSCode extension                                              |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/)  | Running GitHub Actions locally                  | [docker.com](https://www.docker.com/products/docker-desktop/)                   |
| [act](https://github.com/nektos/act)                               | Running GitHub Actions locally                  | macOS: `brew install act`; Linux/Windows: use upstream releases                 |
| [actionlint](https://github.com/rhysd/actionlint) and `shellcheck` | `/deep-review-pro` orchestrator static pre-pass | macOS: `brew install actionlint shellcheck`; other platforms: upstream releases |

Node.js includes `npm`. CI uses `actions/setup-node@v6` with `node-version-file: .node-version` and `check-latest: true`; `.node-version` pins the exact Node version used by local tooling and workflow runs.

Docker, `act`, Bruno, and `actionlint` are optional unless you are running their matching local workflows.

## Local Files

| File                 | Committed? | Purpose                                                           |
| -------------------- | ---------- | ----------------------------------------------------------------- |
| `.env.example`       | yes        | Template for local Playwright credentials and AI-provider secrets |
| `.env`               | no         | Local Playwright credentials and AI-provider secrets              |
| `.vars.example`      | yes        | Template for local workflow gates and CI-like variables           |
| `.vars`              | no         | Local workflow gates loaded by Playwright and `act`               |
| `bruno/.env.example` | yes        | Template for Bruno collection credentials                         |
| `bruno/.env`         | no         | Bruno CLI/app credentials at the collection root                  |

Sub-projects load repository-level `.env` and `.vars` with `dotenv` from two levels up (`../../.env` and `../../.vars`).

## `.env` Keys

Copy `.env.example` to `.env` at the repository root.

| Name                        | Required                     | Used by                                        | Secret?       | Notes                                                                                                                       |
| --------------------------- | ---------------------------- | ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ORWELLSTAT_USER`           | yes                          | Playwright authenticated tests                 | yes           | Populated-account username. Default account for authenticated tests.                                                        |
| `ORWELLSTAT_PASSWORD`       | yes                          | Playwright authenticated tests                 | yes           | Populated-account password.                                                                                                 |
| `ORWELLSTAT_USER_EMPTY`     | yes                          | Empty-state tests                              | yes           | Empty-account username. Do not log in manually; any visit can make empty-state assertions fail.                             |
| `ORWELLSTAT_PASSWORD_EMPTY` | yes                          | Empty-state tests                              | yes           | Empty-account password.                                                                                                     |
| `ORWELLSTAT_EMAIL`          | yes for admin mutating tests | `zone-admin.spec.ts`                           | personal data | Canonical email currently stored on the populated account. Used to restore state after mutating-settings tests.             |
| `ENV`                       | optional                     | Playwright and Bruno                           | no            | `production` by default; set `staging` for staging.                                                                         |
| `BASIC_AUTH_USER`           | staging only                 | Playwright and Bruno                           | yes           | Staging HTTP Basic Auth user.                                                                                               |
| `BASIC_AUTH_PASSWORD`       | staging only                 | Playwright and Bruno                           | yes           | Staging HTTP Basic Auth password. If user is set but password is empty, staging requests return 401.                        |
| `ORWELLSTAT_DRAIN_TOKEN`    | tracking/filter tests        | `fireTrackingHit()`                            | yes           | Shared token for `/scripts/drain.php`; must match the server-side token. Missing value makes seeded-filter tests fail fast. |
| `ANTHROPIC_API_KEY`         | optional                     | AI diagnosis and self-healing fallback         | yes           | Required when Anthropic is the active AI provider.                                                                          |
| `GEMINI_API_KEY`            | optional                     | AI diagnosis and self-healing fallback         | yes           | Required when Gemini is the active AI provider.                                                                             |
| `OPENROUTER_API_KEY`        | optional                     | PR reviewer through Anthropic-compatible proxy | yes           | Required when `ANTHROPIC_BASE_URL` points to OpenRouter or another Bearer-auth proxy.                                       |

## GitHub Secrets

In CI, secret values are injected through GitHub Actions secrets and environment-scoped secrets. Keep secret names aligned with `.env.example` unless a workflow explicitly documents a different name.

| Secret                                               | Required when                                                |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `ORWELLSTAT_USER`, `ORWELLSTAT_PASSWORD`             | Playwright or Bruno runs against authenticated pages         |
| `ORWELLSTAT_USER_EMPTY`, `ORWELLSTAT_PASSWORD_EMPTY` | Playwright empty-state tests run                             |
| `ORWELLSTAT_EMAIL`                                   | Admin mutating-settings tests run                            |
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`             | Staging runs                                                 |
| `ORWELLSTAT_DRAIN_TOKEN`                             | Tracking-hit seeding is exercised                            |
| `ANTHROPIC_API_KEY`                                  | Native Anthropic diagnosis/review/self-healing is enabled    |
| `GEMINI_API_KEY`                                     | Gemini diagnosis/self-healing is enabled                     |
| `OPENROUTER_API_KEY`                                 | Anthropic-compatible proxy is configured for the PR reviewer |

## `.vars` And Repository Variables

Copy `.vars.example` to `.vars` for local runs. In GitHub, set matching values under **Settings -> Variables -> Actions**. Most values are feature gates: set exactly `true` to enable; absent or any other value disables the feature or workflow job.

`RUNNER` is not a boolean gate. Set it to `self-hosted` to route non-dispatch workflow jobs to the local runner, or leave it unset for `ubuntu-latest`.

| Variable                         | Purpose                                                                        | Applies to                              |
| -------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| `AI_REVIEW`                      | Enables `claude-code-review.yml`                                               | Pull request review workflow            |
| `PLAYWRIGHT_TYPESCRIPT`          | Enables Playwright test, lint, and real-credential workflows                   | PR, push, schedule, dispatch            |
| `BRUNO`                          | Enables `bruno.yml`                                                            | PR, push, dispatch                      |
| `QUALITY_METRICS`                | Enables `quality-metrics.yml`                                                  | Monthly schedule and dispatch           |
| `SELF_HEALING`                   | Enables selector self-healing workflow                                         | Failed Playwright workflow runs         |
| `AI_DIAGNOSIS`                   | Adds AI diagnosis attachments to failed Playwright tests                       | Local and CI Playwright runs            |
| `AI_PROVIDER`                    | Selects diagnosis/self-healing provider (`anthropic` default, or `gemini`)     | Local and CI Playwright runs            |
| `AI_MODEL_FAST`                  | Overrides fast-tier diagnosis model                                            | Local and CI Playwright runs            |
| `AI_MODEL_STRONG`                | Overrides strong-tier selector-fix model                                       | Self-healing and diagnosis selector fix |
| `ANTHROPIC_BASE_URL`             | Base URL for Anthropic-compatible PR reviewer routing                          | `claude-code-review.yml`                |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | Haiku-tier model slug for the PR reviewer when base URL is overridden          | `claude-code-review.yml`                |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet-tier model slug for the PR reviewer when base URL is overridden         | `claude-code-review.yml`                |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`   | Opus-tier model slug for the PR reviewer when base URL is overridden           | `claude-code-review.yml`                |
| `RUNNER`                         | Default runner label for workflow jobs                                         | Workflows with runner selection         |
| `VALIDATE_REMOTE`                | Sends XHTML/CSS validation to classic W3C services instead of local validators | Playwright `validation.spec.ts`         |

For OpenRouter, follow the value and endpoint note in `.vars.example`; the Anthropic SDK appends its own versioned path internally.

## AI Diagnosis Data Egress

When `AI_DIAGNOSIS=true`, failed Playwright tests can send redacted error messages, DOM snippets, and console logs to the configured provider. The redaction pattern table and the list of data that still crosses the provider boundary live in [SECURITY.md - AI diagnosis data egress](../SECURITY.md#ai-diagnosis-data-egress).

The local `dom.xhtml` Playwright attachment is not redacted. It is saved in the test output directory and any published Playwright report artifact. Redaction happens on the copy sent to the AI provider.
