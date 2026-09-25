# AGENTS.md

This file is the repository's behavioral source of truth for coding assistants (Claude Code, Codex, Gemini, and other AGENTS.md readers).

> **Keep `README.md` and `docs/` up to date.** `README.md` is the concise human entry point and documentation map. Detailed reference material lives in the focused files under `docs/`: configuration in `docs/CONFIGURATION.md`, Playwright architecture and commands in `docs/PLAYWRIGHT.md`, per-spec coverage in `docs/TEST_INVENTORY.md`, CI workflows in `docs/CI.md`, local CI/self-hosted runners in `docs/CI_LOCAL.md`, Bruno in `docs/BRUNO.md`, AI assistant/MCP/worktree guidance in `docs/AI_ASSISTANTS.md`, and project-board conventions in `docs/PROJECT_MANAGEMENT.md`. Whenever structure, commands, CI, environment variables, sub-projects, or operational behavior change, update the focused owner doc before finishing; update `README.md` only when the top-level summary or documentation map changes. `AGENTS.md` documents behavioral instructions only; update it only when adding, changing, or removing behavioral guidance. For the code review checklist, issue format, and issue fix workflow, edit the relevant skill file instead.

> **Skill files are the source of truth for their workflows.** `.claude/skills/fix-issue/SKILL.md` owns the issue fix workflow; `.claude/skills/create-issue/SKILL.md` owns the GitHub issue format and the operational steps for adding new items to Project #1; `.claude/skills/deep-review-lite/SKILL.md` owns the code review checklist. `AGENTS.md` only points to them. When changing those workflows, formats, or the checklist, edit the skill file, not this file. Project #1 board conventions live in `docs/PROJECT_MANAGEMENT.md`.

For the complete documentation map, start with [README.md](README.md) and [docs/INDEX.md](docs/INDEX.md).

---

## Code review checklist

When reviewing changes, follow the checklist in `.claude/skills/deep-review-lite/SKILL.md`. For the full multi-agent review workflow, use `.claude/skills/deep-review-pro/SKILL.md`.

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

Run commits as a direct `git commit ...` command from the repository checkout so local Git hooks run consistently. The assistant review and verification gate runs at publication time: use a direct `git push ...` command and avoid compound or wrapped publication commands such as `cd repo && git push`, `env git push`, or alias-only push forms so the publish gate runs before refs are published.

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

This repository defines MCP (Model Context Protocol) servers in `.mcp.json` at the repo root (Cursor uses [`.cursor/mcp.json`](.cursor/mcp.json), symlinked to the same definitions). Detailed setup, per-assistant config paths, and the full `playwright-report-mcp` tool reference live in [docs/AI_ASSISTANTS.md](docs/AI_ASSISTANTS.md). Load the MCP config appropriate to your assistant and use the declared servers when they are the most appropriate tool for a task:

| Server                  | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `playwright-report-mcp` | Run the Playwright test suite and retrieve structured results (pass/fail, errors, attachments) |
| `playwright`            | Browser automation — navigate pages, take screenshots, interact with UI elements               |
| `MCP_DOCKER`            | Docker MCP gateway — interact with containers (used with `act` for local CI)                   |
| `quality-metrics`       | Query defect escape rate, MTTR, and metrics history without running `quality-metrics.yml`      |
| `coverage-matrix`       | Query and update `playwright/typescript/coverage-matrix.json` through typed tools              |

- Use `playwright-report-mcp` when you need to run or inspect test results programmatically — e.g. during self-healing workflows, verifying a fix, or checking which tests are failing. Prefer it over invoking `npx playwright test` via shell and parsing stdout. Every tool call must include `workingDirectory`: `"playwright/typescript"` for the main worktree, or `"../<worktree-name>/playwright/typescript"` (e.g. `"../orwellstat-330/playwright/typescript"`) for a sibling worktree. Omitting it defaults to the repo root, which has no `playwright.config.*` and will fail. The allowlist (`PW_ALLOWED_DIRS=".."` in `.mcp.json`) authorizes the repo root's parent, covering every sibling worktree under the same directory. To choose the target environment, pass `env: { "ENV": "staging" }` or `env: { "ENV": "production" }` to `run_tests` / `list_tests`. Always pass it when the target matters. Without it, the run uses `ENV` from the root `.env` (default `production`). `PW_ALLOWED_ENV="ENV"` allows only that variable.
- Use `playwright` for exploratory or diagnostic tasks that benefit from live browser interaction — e.g. inspecting the running application, verifying a UI fix, taking screenshots. Prefer it over describing what the page looks like from memory.
- Use `MCP_DOCKER` when interacting with Docker containers started by `act` — e.g. running a command inside a container or finding a container by name.
- Use `quality-metrics` when you need defect escape rate, MTTR, or historical metrics on demand. Prefer it over re-running `scripts/generate-quality-metrics.py` or waiting for the monthly `quality-metrics.yml` workflow.
- Use `coverage-matrix` when you need to query coverage gaps or summary percentages, or to flip a single page-category cell to covered. Prefer it over reading or editing `playwright/typescript/coverage-matrix.json` by hand.

---

## Runtime substitutions

`.claude/skills/` is the source of truth for project workflow text. Codex exposes the same skills through `.agents/skills/` symlinks. Specialist reviewer prompts live in `.claude/agents/`; Codex wrappers live in `.codex/agents/*.toml` and point back at those prompts. Do not duplicate skill or agent text into tool-specific files.

[`.claude/settings.json`](./.claude/settings.json) is the repository's concrete allow/deny baseline for tool usage and sensitive file access. When the runtime does not enforce that file directly, apply it manually:

- treat entries in `permissions.allow` as the default safe scope for commands and web access
- treat entries in `permissions.deny` as hard no-read / no-access rules
- follow the intent of the configured hooks before committing or after relevant edits, especially the TypeScript and formatting checks for `playwright/typescript`
- if the runtime's own rules are stricter than `.claude/settings.json`, follow the stricter rule
- if the runtime's own rules are looser than `.claude/settings.json`, still follow `.claude/settings.json` for work in this repository

When an instruction names a Claude-only mechanic, use the closest equivalent and tell the user what could not be followed literally, what you did instead, and any remaining limitation:

| Claude mechanic                         | Codex equivalent                                                                                           | Gemini CLI equivalent                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Skill` tool                            | Load the project skill through Codex skill discovery                                                       | Load the project skill through the active skill discovery  |
| `Task` tool                             | Use `spawn_agent` / `wait_agent` only when the user explicitly authorized sub-agents; otherwise work locally | Work locally unless the user explicitly authorized sub-agents |
| `Read`, `Grep`, `Glob`                  | Use file inspection and `rg`-based search                                                                  | Use the runtime's file and search tools                    |
| Claude hooks in `.claude/settings.json` | Use `.codex/hooks.json` for supported command hooks and run unsupported checks explicitly                  | Run the same checks explicitly                             |
| Claude agent hook runners               | Follow the same review workflow manually, or via Codex sub-agents only when authorized                     | Follow the same review workflow manually                   |
| Shell command                           | The runtime's shell tool                                                                                   | `run_shell_command`                                        |
| Web fetch                               | The runtime's web tool                                                                                     | `web_fetch`                                                |

Gemini CLI loads this file because [`.gemini/settings.json`](./.gemini/settings.json) sets `context.fileName` to `AGENTS.md`. Leave `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` out of the committed tree so Claude Code loads this file directly when it can. A session that cannot load `AGENTS.md` directly may keep an untracked root `CLAUDE.md` whose only line is `@AGENTS.md`; leave that file untracked and put no other instructions in it. [docs/AI_ASSISTANTS.md](docs/AI_ASSISTANTS.md) records the feature-flag requirement and the other sessions that need this import. Any other `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` on the project path makes Claude Code skip direct loading of this file.
