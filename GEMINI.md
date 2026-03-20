# GEMINI.md - Foundational Mandates for Orwell Stat

Follow the repository guidance in [CLAUDE.md](./CLAUDE.md).

Also read [`.claude/settings.json`](./.claude/settings.json) as the repository's concrete allow/deny baseline for tool usage and sensitive file access.

When Gemini tooling does not enforce that file directly, apply it manually:

- Treat entries in `permissions.allow` as the default safe scope for commands and web access.
- Treat entries in `permissions.deny` as hard no-read / no-access rules.
- Follow the intent of the configured hooks before committing or after relevant edits, especially the TypeScript and formatting checks for `playwright/typescript`.
- If Gemini-specific runtime rules (system prompt) are stricter than `.claude/settings.json`, follow the stricter rule.
- If Gemini-specific runtime rules are looser than `.claude/settings.json`, still follow `.claude/settings.json` for work in this repository.

If [CLAUDE.md](./CLAUDE.md), [`.claude/settings.json`](./.claude/settings.json), or the documents they reference contain instructions that are specific to Claude tooling or Claude-only features, do not ignore them silently. Use the closest Gemini-equivalent workflow or safety rule available (e.g., using `run_shell_command` for bash, `web_fetch` for web access). State what Claude-specific instruction could not be followed literally, what you did instead, and any practical limitation or behavior difference that remains.
