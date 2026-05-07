# AGENTS.md

Follow the repository guidance in [CLAUDE.md](./CLAUDE.md).

Also read [`.claude/settings.json`](./.claude/settings.json) as the repository's concrete allow/deny baseline for tool usage and sensitive file access.

When Codex tooling does not enforce that file directly, apply it manually:

- treat entries in `permissions.allow` as the default safe scope for commands and web access
- treat entries in `permissions.deny` as hard no-read / no-access rules
- follow the intent of the configured hooks before committing or after relevant edits, especially the TypeScript and formatting checks for `playwright/typescript`
- if Codex-specific runtime rules are stricter than `.claude/settings.json`, follow the stricter rule
- if Codex-specific runtime rules are looser than `.claude/settings.json`, still follow `.claude/settings.json` for work in this repository

If [CLAUDE.md](./CLAUDE.md), [`.claude/settings.json`](./.claude/settings.json), or the documents they reference contain instructions that are specific to Claude tooling or Claude-only features, do not ignore them silently. Use the closest Codex-equivalent workflow or safety rule available, and explicitly warn the user about the substitution. State what Claude-specific instruction could not be followed literally, what you did instead, and any practical limitation or behavior difference that remains.

## Codex references to Claude workflows

`.claude/skills/` and `.claude/agents/` are the source of truth for project workflows and specialist reviewer prompts. Codex exposes the same skills through `.agents/skills/` symlinks and the same specialist agents through thin `.codex/agents/*.toml` wrappers. Do not duplicate the full skill or agent text into Codex-specific files.

Use these substitutions when a Claude source file names Claude-only mechanics:

- Claude `Skill` tool: load the referenced project skill through Codex's native skill discovery.
- Claude `Task` tool: use Codex `spawn_agent` / `wait_agent` only when the user has explicitly authorized sub-agents; otherwise perform the bounded work locally.
- Claude `Read`, `Grep`, and `Glob`: use Codex file inspection and `rg`-based search.
- Claude hooks in `.claude/settings.json`: use `.codex/hooks.json` for supported command hooks and run any unsupported checks explicitly before committing or finishing.
- Claude agent hook runners: Codex cannot run these literally; follow the same review workflow manually or via Codex sub-agents when explicitly authorized.
