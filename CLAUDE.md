# CLAUDE.md

This file provides behavioral instructions to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep `README.md` and `docs/` up to date.** Whenever the project structure changes — new directories, renamed files, new sub-projects, changed commands, updated CI, modified environment variables — update `README.md` (and the relevant file under `docs/` if the change affects operational content there) before finishing the task. `CLAUDE.md` documents behavioral instructions only; update it only when adding, changing, or removing behavioral guidance for Claude — such as the commit message convention or any other conventions Claude should follow. For the code review checklist, issue format, and issue fix workflow, edit the relevant skill file instead.

> **Skill files are the source of truth for their workflows.** `.claude/skills/fix-issue/SKILL.md` owns the issue fix workflow; `.claude/skills/create-issue/SKILL.md` owns the GitHub issue format and the operational steps for adding new items to Project #1; `.claude/skills/deep-review/SKILL.md` owns the code review checklist. `CLAUDE.md` only points to them. When changing those workflows, formats, or the checklist, edit the skill file — not this file. Project #1 board conventions live in `README.md`.

For repository structure, environment variable definitions, `playwright/typescript` architecture (directory layout, POM conventions, path aliases, Playwright config, CI workflows), and Bruno documentation, see [README.md](README.md) and the `docs/` directory. These are the single source of truth for all reference material — `README.md` for the core project reference, `docs/` for operational guides (self-hosted runner setup, local CI with `act`, and the fork adaptation guide).

---

## Code review checklist

When reviewing changes, follow the checklist in `.claude/skills/deep-review/SKILL.md`. The multi-agent orchestrator at `.claude/skills/deep-review-next/SKILL.md` coexists during the rollout window (#435) and is the preferred path when present.

---

## GitHub issue format

When creating GitHub issues for requirements, bugs, or code review findings, follow the format and steps in `.claude/skills/create-issue/SKILL.md`.

---

## Authenticated-test account selection

Authenticated Playwright specs default to the **populated** account (real hit data). Tests asserting empty-state UI opt in per file with `test.use({ storageState: EMPTY_STORAGE_STATE })` (from `@fixtures/storage-state`). The `authenticatedRequest` API fixture inherits the project's populated `storageState` — there is no API-side empty-account switch; reach for `unauthenticatedRequest` when an unauthenticated session is needed. Never branch at runtime on which account is logged in.

---

## Commit message convention

Commit messages are always a **short, single-line description** with no body and no `Co-Authored-By` trailer. When a commit relates to one or more GitHub issues, **prefix the message with `#` and the issue number(s)**, followed by the description:

- Single issue: `#63 Add network mocking tests`
- Multiple issues: `#63 #64 Add network mocking tests and fixtures`
- No issue: `Fix typo in README`

The `#N` prefix must come first so `git log --oneline` and GitHub cross-references work at a glance.

---

## Issue fix workflow

When fixing a GitHub issue, follow the steps in `.claude/skills/fix-issue/SKILL.md`.

---

## Creating pull requests

When creating a PR with `gh pr create`, always write the body to a temp file and use `--body-file`:

```bash
# Write body to temp file (via Write tool or Bash heredoc)
cat > /tmp/pr_body.md << 'EOF'
## Summary
...
EOF

gh pr create --title "..." --body-file /tmp/pr_body.md
```

Never use `--body "..."` or a heredoc directly in the `gh pr create` call when the body contains backticks or code blocks — shell quoting causes backticks to render as `\`` in the GitHub description or produces an "unexpected EOF" error.

---

## MCP servers

This repository defines MCP (Model Context Protocol) servers in `.mcp.json` at the repo root. Any MCP-compatible AI assistant should load this file and use the declared servers when they are the most appropriate tool for a task:

| Server                  | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `playwright-report-mcp` | Run the Playwright test suite and retrieve structured results (pass/fail, errors, attachments) |
| `playwright`            | Browser automation — navigate pages, take screenshots, interact with UI elements               |
| `MCP_DOCKER`            | Docker MCP gateway — interact with containers (used with `act` for local CI)                   |
| `quality-metrics`       | Query defect escape rate, MTTR, and metrics history without running `quality-metrics.yml`      |
| `coverage-matrix`       | Query and update `playwright/typescript/coverage-matrix.json` through typed tools              |

- Use `playwright-report-mcp` when you need to run or inspect test results programmatically — e.g. during self-healing workflows, verifying a fix, or checking which tests are failing. Prefer it over invoking `npx playwright test` via shell and parsing stdout. Every tool call must include `workingDirectory`: `"playwright/typescript"` for the main worktree, or `"../<worktree-name>/playwright/typescript"` (e.g. `"../orwellstat-330/playwright/typescript"`) for a sibling worktree. Omitting it defaults to the repo root, which has no `playwright.config.*` and will fail. The allowlist (`PW_ALLOWED_DIRS=".."` in `.mcp.json`) authorizes the repo root's parent, covering every sibling worktree under the same directory.
- Use `playwright` for exploratory or diagnostic tasks that benefit from live browser interaction — e.g. inspecting the running application, verifying a UI fix, taking screenshots. Prefer it over describing what the page looks like from memory.
- Use `MCP_DOCKER` when interacting with Docker containers started by `act` — e.g. running a command inside a container or finding a container by name.
- Use `quality-metrics` when you need defect escape rate, MTTR, or historical metrics on demand. Prefer it over re-running `scripts/generate-quality-metrics.py` or waiting for the monthly `quality-metrics.yml` workflow.
- Use `coverage-matrix` when you need to query coverage gaps or summary percentages, or to flip a single page-category cell to covered. Prefer it over reading or editing `playwright/typescript/coverage-matrix.json` by hand.
