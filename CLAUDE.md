# CLAUDE.md

This file provides behavioral instructions to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep `README.md` up to date.** Whenever the project structure changes — new directories, renamed files, new sub-projects, changed commands, updated CI, modified environment variables — update `README.md` before finishing the task. `CLAUDE.md` documents behavioral instructions only; update it only when adding, changing, or removing behavioral guidance for Claude — such as the commit message convention or any other conventions Claude should follow. For the code review checklist, issue format, and issue fix workflow, edit the relevant skill file instead.

> **Skill files are the source of truth for their workflows.** `.claude/skills/fix-issue/SKILL.md` owns the issue fix workflow; `.claude/skills/create-issue/SKILL.md` owns the GitHub issue format; `.claude/skills/review/SKILL.md` owns the code review checklist. `CLAUDE.md` only points to them. When changing those workflows, formats, or the checklist, edit the skill file — not this file.

For repository structure, environment variable definitions, `playwright/typescript` architecture (directory layout, POM conventions, path aliases, Playwright config, CI workflows), and Bruno documentation, see [README.md](README.md). That file is the single source of truth for all reference material.

---

## Code review checklist

When reviewing changes, follow the checklist in `.claude/skills/review/SKILL.md`.

---

## GitHub issue format

When creating GitHub issues for requirements, bugs, or code review findings, follow the format and steps in `.claude/skills/create-issue/SKILL.md`.

---

## Commit message convention

Commit messages are always a **short, single-line description** with no body and no `Co-Authored-By` trailer. When a commit relates to one or more GitHub issues, **prefix the message with the issue number(s)** separated by spaces, followed by the description:

- Single issue: `63 Add network mocking tests`
- Multiple issues: `63 64 Add network mocking tests and fixtures`
- No issue: `Fix typo in README`

The ticket prefix must come first so `git log --oneline` and GitHub cross-references work at a glance.

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

| Server | Purpose |
|---|---|
| `MCP_DOCKER` | Docker MCP gateway — manage containers, images, and services |
| `playwright` | Browser automation — navigate pages, take screenshots, interact with UI elements |

Use the `playwright` MCP for exploratory or diagnostic tasks that benefit from live browser interaction (e.g. inspecting the running application, verifying a UI fix, taking screenshots). Prefer it over describing what the page looks like from memory.
