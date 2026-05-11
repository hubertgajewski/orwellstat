# orwellstat - End-to-End Test Suite

Multi-language, multi-framework end-to-end test suite for [Orwell Stat](https://orwellstat.hubertgajewski.com), a Polish-language web analytics and statistics service.

This repository contains:

- Playwright tests in TypeScript for public and authenticated Orwell Stat pages.
- A Bruno API request collection for login and CSRF checks.
- GitHub Actions workflows for browser-matrix testing, linting, coverage tracking, self-healing selector proposals, code review, Bruno, MCP tests, and quality metrics.
- Local MCP servers and AI-assistant workflows used by Claude Code, Codex, and other MCP-compatible tools.

## Quick Start

Use Node.js 26.x. Docker, `act`, Bruno, and `actionlint` are optional unless you need their matching workflows.

```bash
cp .env.example .env
cp .vars.example .vars
cd playwright/typescript
npm ci
npx playwright install --with-deps
npx playwright test --grep @smoke
```

Open AI assistants from the repository root so `.mcp.json` and the project guidance files are discovered.

## Contents

- [Quick Start](#quick-start)
- [Common Commands](#common-commands)
- [Configuration Summary](#configuration-summary)
- [Test Suite Summary](#test-suite-summary)
- [Repository Structure](#repository-structure)
- [Documentation](#documentation)
- [AI Assistant Notes](#ai-assistant-notes)

## Common Commands

Run from `playwright/typescript/` unless noted otherwise:

```bash
# All Playwright tests
npx playwright test

# Smoke and regression subsets
npx playwright test --grep @smoke
npx playwright test --grep @regression

# A single browser project
npx playwright test --project=chromium

# A single spec or test title
npx playwright test tests/navigation.spec.ts
npx playwright test -g "test name"

# HTML report
npx playwright show-report

# Formatting, TypeScript, and unit tests
npm run format
npm run format:check
npm run tsc
npm run test:unit

# Coverage-matrix drift check
npm run verify:matrix
```

For Bruno:

```bash
cd bruno
npm ci
npx bru run --env production
npx bru run --env staging
```

For local GitHub Actions with `act`, see [docs/CI_LOCAL.md](docs/CI_LOCAL.md).

## Configuration Summary

Local secrets live in gitignored `.env` and `bruno/.env` files. Local CI and workflow feature gates live in gitignored `.vars`. Copy the examples first:

```bash
cp .env.example .env
cp .vars.example .vars
cp bruno/.env.example bruno/.env
```

The populated account is the default authenticated account. The empty account is used only by tests that assert empty-state UI. Staging additionally needs HTTP Basic Auth credentials. AI diagnosis and self-healing are opt-in and can send redacted failure context to the configured provider.

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for every `.env`, `.vars`, GitHub secret, and GitHub Actions variable.

## Test Suite Summary

The Playwright suite covers public pages, authenticated pages, XHTML/CSS validation, accessibility, visual regression, tracking snippets, API status checks, form behavior, and manual coverage-matrix drift.

Detailed commands, tags, fixtures, Page Object Model conventions, path aliases, and Playwright config behavior live in [docs/PLAYWRIGHT.md](docs/PLAYWRIGHT.md). The per-spec catalogue lives in [docs/TEST_INVENTORY.md](docs/TEST_INVENTORY.md).

## Repository Structure

```text
.env.example                  # template for local Playwright and AI-provider secrets
.vars.example                 # template for local workflow gates and CI variables
.mcp.json                     # MCP server definitions
.github/actions/              # local composite actions used by workflows
.github/workflows/            # CI workflows
.claude/                      # Claude Code project skills and specialist agents
.agents/                      # Codex-visible skill symlinks to .claude/skills
.codex/                       # Codex MCP and hook configuration
bruno/                        # Bruno API request collection
docs/                         # focused reference and operational documentation
mcp/                          # local MCP servers and shared helpers
playwright/typescript/        # Playwright tests, POMs, fixtures, utilities, snapshots
scripts/                      # quality metrics, self-healing, runner, and hook helpers
AGENTS.md                     # Codex entrypoint; delegates shared guidance to CLAUDE.md
CLAUDE.md                     # repository behavioral guidance for Claude Code
GEMINI.md                     # Gemini entrypoint; delegates shared guidance to CLAUDE.md
LICENSE                       # MIT license
QUALITY_METRICS.md            # generated quality metrics and coverage report
SECURITY.md                   # security policy and AI diagnosis data-egress policy
```

Each Playwright minor bump ships new browser engine builds. Expect small visual-snapshot drift and refresh Linux baselines with `update-visual-baselines.yml` before merging dependency PRs that change `@playwright/test`.

## Documentation

| Topic                                                         | File                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Documentation index                                           | [docs/INDEX.md](docs/INDEX.md)                           |
| Configuration, credentials, `.env`, `.vars`, GitHub variables | [docs/CONFIGURATION.md](docs/CONFIGURATION.md)           |
| Playwright setup, commands, tags, architecture, config        | [docs/PLAYWRIGHT.md](docs/PLAYWRIGHT.md)                 |
| Per-spec Playwright test catalogue                            | [docs/TEST_INVENTORY.md](docs/TEST_INVENTORY.md)         |
| GitHub Actions workflows and CI behavior                      | [docs/CI.md](docs/CI.md)                                 |
| Self-hosted runners and local CI with `act`                   | [docs/CI_LOCAL.md](docs/CI_LOCAL.md)                     |
| Bruno API collection                                          | [docs/BRUNO.md](docs/BRUNO.md)                           |
| AI assistant skills, MCP servers, and worktrees               | [docs/AI_ASSISTANTS.md](docs/AI_ASSISTANTS.md)           |
| Project board, estimates, epics, dates, actual hours          | [docs/PROJECT_MANAGEMENT.md](docs/PROJECT_MANAGEMENT.md) |
| Forking and adapting the suite                                | [docs/FORK.md](docs/FORK.md)                             |
| Security and AI diagnosis data egress                         | [SECURITY.md](SECURITY.md)                               |
| Quality metrics and coverage trend                            | [QUALITY_METRICS.md](QUALITY_METRICS.md)                 |
| License                                                       | [LICENSE](LICENSE)                                       |

## AI Assistant Notes

Claude, Codex, Gemini, and MCP-compatible assistants should read the repository entrypoint for their tool first (`CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`), then use [docs/AI_ASSISTANTS.md](docs/AI_ASSISTANTS.md) for project skills, MCP server setup, and worktree details.

When updating the project, keep this README concise. Put operational detail in the focused file under `docs/` that owns the topic.
