# Documentation Index

This directory contains the long-form reference material for the orwellstat test suite. The root [README.md](../README.md) is intentionally short; use this index to find the detailed operational or AI-agent reference.

| Need                                                               | Read                                           |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| Set up local credentials, staging, AI diagnosis, or workflow gates | [CONFIGURATION.md](CONFIGURATION.md)           |
| Run or extend the Playwright suite                                 | [PLAYWRIGHT.md](PLAYWRIGHT.md)                 |
| Find what each spec file covers                                    | [TEST_INVENTORY.md](TEST_INVENTORY.md)         |
| Understand GitHub Actions workflows                                | [CI.md](CI.md)                                 |
| Run workflows locally or use self-hosted runners                   | [CI_LOCAL.md](CI_LOCAL.md)                     |
| Run Bruno API checks                                               | [BRUNO.md](BRUNO.md)                           |
| Use Claude/Codex/Gemini skills, MCP servers, or worktrees          | [AI_ASSISTANTS.md](AI_ASSISTANTS.md)           |
| Create issues, estimate work, or interpret project-board fields    | [PROJECT_MANAGEMENT.md](PROJECT_MANAGEMENT.md) |
| Adapt this repository to another deployment target                 | [FORK.md](FORK.md)                             |
| Review security policy and AI diagnosis data egress                | [../SECURITY.md](../SECURITY.md)               |
| Review generated quality metrics and coverage                      | [../QUALITY_METRICS.md](../QUALITY_METRICS.md) |

## Ownership Rules

- `README.md` is the human entry point and documentation map.
- `docs/CONFIGURATION.md` owns `.env`, `.vars`, GitHub Actions variables, and secrets explanations.
- `docs/PLAYWRIGHT.md` owns Playwright commands, tags, architecture, fixtures, POM conventions, and config behavior.
- `docs/TEST_INVENTORY.md` owns per-spec test descriptions.
- `docs/CI.md` owns workflow behavior, triggers, gates, artifacts, and root automation-script summaries.
- `docs/CI_LOCAL.md` owns self-hosted runner setup, local `act` usage, local CI compatibility, and related credential hygiene.
- `docs/BRUNO.md` owns Bruno setup, request behavior, and Bruno CI notes.
- `docs/AI_ASSISTANTS.md` owns project skills, MCP server setup, and worktree guidance.
- `docs/PROJECT_MANAGEMENT.md` owns Project #1 conventions, estimate scales, epic/story rules, dates, and actual hours.

When a change affects a documented behavior, update the focused owner file and only add or adjust the root README summary when the top-level navigation changes.
