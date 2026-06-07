# AI Assistants

This file owns project-specific AI assistant workflows, MCP server reference, and worktree guidance. Behavioral rules remain in the assistant entrypoint files:

- [CLAUDE.md](../CLAUDE.md)
- [AGENTS.md](../AGENTS.md)
- [GEMINI.md](../GEMINI.md)

## Project Skills

Project-scoped skills live in `.claude/skills/`. Codex exposes the same skills through `.agents/skills/` symlinks. Do not duplicate skill text into Codex-specific files.

| Skill               | Usage                         | Purpose                                                                                             |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `/fix-issue`        | `/fix-issue <number>`         | Fetch, implement, test, review, commit, and open a PR for a GitHub issue                            |
| `/create-issue`     | `/create-issue <description>` | Draft and create a GitHub issue in the project format, then add it to Project #1                    |
| `/deep-review-lite` | `/deep-review-lite`           | Run the legacy local diff checklist and mandatory security/simplification checks                    |
| `/deep-review-pro`  | `/deep-review-pro [scope]`    | Orchestrate specialist review agents over local diff, PR, range, file, directory, or freeform scope |
| `/generate-stubs`   | `/generate-stubs`             | Generate `test.fixme()` stubs from coverage-matrix gaps                                             |
| `/generate-test`    | `/generate-test <page>`       | Scaffold `test.fixme()` blocks for one page's content/accessibility/visual gaps                     |

`.claude/skills/` is the source of truth for workflow text.

## Specialist Agents

Claude specialist agents live under `.claude/agents/`. Codex wrappers live under `.codex/agents/` and point back to the matching Claude prompt. Keep `.codex/` as the canonical Codex config directory and do not add a second `.Codex/` copy.

The current `/deep-review-pro` roster is documented in `.claude/skills/deep-review-pro/SKILL.md`.

Specialist agents keep a short inline safety/schema reminder, while the shared prompt-frame, sibling-ownership, confidence, citation, sentinel, and summary-count rules live in `.claude/skills/deep-review-pro/SKILL.md` § Shared specialist-agent contract. When adding or changing an agent, update that shared contract and the agent-specific deltas together.

`/deep-review-pro` runs an orchestrator static pre-pass before specialist dispatch. The pre-pass reports mechanical TypeScript compile, format, actionlint/shellcheck, deny-pattern/secret-scan, and coverage-matrix availability or shape findings in a `### static-pre-pass` aggregate section. Static failures can block readiness directly; unavailable checks are reported explicitly and fall back to the relevant specialist when semantic review can still cover the gap.

When a diff exceeds 3000 changed lines, the orchestrator classifies paths into high-risk, normal, low-risk documentation/test, and generated/binary buckets. High-risk and normal hunks stay inline; low-risk and generated files collapse to metadata-only placeholder hunks so agents inspect governing manifests or source instead of repeating thousands of low-value lines. The aggregate emits a `### large-diff-bucketing` section and blocks `status: ready` while `partial-review: yes` unless the caller documents an explicit full-review override and every required bucket has been covered.

`/deep-review-pro` dispatches several broad, low-risk reviewers conditionally. `deep-review-project-checklist` runs only for Playwright or Bruno convention surfaces; workflow-only changes are handled by the static pre-pass plus `deep-review-ci`. `deep-review-docs` runs only when docs-consistency triggers are present; `deep-review-security` runs for source, workflow, manifest, config/environment, auth/session/crypto, deny-path, or credential-like added-line risk triggers and skips only clearly low-risk docs/generated/test-only scopes after those checks pass. Skipped agents appear in the aggregate as `SKIPPED: <trigger> not satisfied` and contribute zero blocking findings.

`/deep-review-pro` uses compact output by default. Compact output keeps static pre-pass failures/unavailable rows, findings, summary counts, skipped/unavailable rows, schema violations, readiness status, reuse counts, and a single token total, while omitting successful pass/N/A checklist detail. Use `/deep-review-pro --usage` or `/deep-review-pro --verbose` to emit the full token/dispatch table and complete per-agent detail.

Dispatched agents receive per-agent prompt frames. Broad reviewers (`security`, `simplification`, `code`, and `architecture`) receive the bucketed full diff when large-diff bucketing is active: high-risk and normal hunks stay inline, while low-risk and generated paths collapse to metadata-only placeholders above the 3000 changed-line threshold. File-specialist reviewers receive only matching hunks plus a complete `<changed-files>` manifest, so they can see what was omitted inline and use their granted read/search tools for surrounding context.

During re-review convergence, `/deep-review-pro` can reuse a non-blocking unchanged agent result when that agent's prompt file, shared references, scoped prompt frame, and complete read-dependency content identities are unchanged. Cached sections are marked `REUSED:` in the aggregate. Prior blockers, newly matched triggers, incomplete dependency telemetry, invalidated cache keys, and changed scoped inputs are dispatched again. If cached results or targeted reruns were used and the aggregate is otherwise ready, the workflow runs one final full matching-agent pass with reuse disabled before it may emit `status: ready`.

Token benchmark fixtures and the before/after reporting workflow live in [deep-review-pro-benchmark](deep-review-pro-benchmark/README.md). Use them before and after `/deep-review-pro` token-cost changes so prompt framing, dispatch, rerun/cache, and aggregate-output effects are measured against stable scopes.

## Codex And Claude Substitutions

When Claude-specific mechanics appear in project docs, use the closest Codex-equivalent workflow:

| Claude mechanic                         | Codex equivalent                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Skill` tool                            | Load the project skill through Codex skill discovery                                                       |
| `Task` tool                             | Use `spawn_agent`/`wait_agent` only when the user explicitly authorized sub-agents; otherwise work locally |
| `Read`, `Grep`, `Glob`                  | Use file inspection and `rg`-based search                                                                  |
| Claude hooks in `.claude/settings.json` | Use `.codex/hooks.json` for supported hooks and run unsupported checks explicitly                          |
| Claude agent hook runners               | Follow the same review workflow manually, or via Codex sub-agents only when authorized                     |

When a Claude-only instruction cannot be followed literally, state the substitution and any remaining limitation.

## Git Worktrees

Per-issue worktrees under `.claude/worktrees/` let parallel assistant sessions avoid colliding on `HEAD`.

Gitignored environment files are auto-symlinked into a new worktree by hooks when possible:

- `.env`
- `.vars`
- `bruno/.env`

If a worktree is created in a way hooks cannot see, run:

```bash
./scripts/provision-worktree-env.sh <worktree-path>
```

The script is idempotent. Re-running is safe.

The Bash hook parses the first non-flag positional argument after `git worktree add`, skipping `-b <branch>` and `-B <branch>`, matching common worktree-add invocations.

Windows is best-effort and unverified. Use Git Bash or WSL so `jq`, `awk`, and `bash` hooks can execute. Native NTFS symlinks require Developer Mode or elevated PowerShell; otherwise provisioning falls back to copying env files. Copies can drift, so re-run the provisioning script after env-file edits.

## MCP Servers

Five MCP servers are declared in [`.mcp.json`](../.mcp.json). Open the repository at the repo root so relative paths and `PW_ALLOWED_DIRS` resolve correctly.

### Assistant MCP config paths

| Assistant   | Project MCP config   | Notes                                                                 |
| ----------- | -------------------- | --------------------------------------------------------------------- |
| Claude Code | `.mcp.json`          | `enableAllProjectMcpServers: true` in `.claude/settings.json`         |
| Cursor      | `.cursor/mcp.json`   | Symlinked to `.mcp.json`; Cursor does not read the root file directly |
| Codex       | `.mcp.json`          | Per [AGENTS.md](../AGENTS.md); shares `.codex/hooks.json` Playwright CLI block |
| Gemini      | `.mcp.json`          | Per [GEMINI.md](../GEMINI.md); runtime loading may differ             |

Assistant pre-shell hooks in `.claude/settings.json` and `.codex/hooks.json` block direct `playwright test` shell commands (including `@playwright/test/cli.js` bypasses) and direct agents to `playwright-report-mcp` instead. Cursor has the same block when using Claude/Codex hook wiring; with `.cursor/mcp.json` present, use MCP tools rather than shell.

### Cursor setup

1. Confirm [`.cursor/mcp.json`](../.cursor/mcp.json) exists (symlink to `.mcp.json`).
2. Restart Cursor after cloning or changing MCP config.
3. Open **Settings → Tools & MCP** and verify each server shows as connected.
4. On failure, check **Output → MCP Logs** (`Cmd+Shift+U`) for `npx`, Node, or missing `mcp/*/dist` build errors.

| Server                        | Key                     | Purpose                                                      |
| ----------------------------- | ----------------------- | ------------------------------------------------------------ |
| playwright-report-mcp         | `playwright-report-mcp` | Run Playwright tests and retrieve structured results         |
| playwright browser automation | `playwright`            | Navigate, click, inspect, and screenshot live pages          |
| Docker MCP gateway            | `MCP_DOCKER`            | Interact with Docker containers, especially when using `act` |
| quality-metrics               | `quality-metrics`       | Query defect escape rate, MTTR, and metric history           |
| coverage-matrix               | `coverage-matrix`       | Query and update `coverage-matrix.json` through typed tools  |

### playwright-report-mcp

Runs through `npx playwright-report-mcp@3.2.2`. The version is pinned in `.mcp.json`.

`playwright-report-mcp@3.2.2` declares `node >=22`; use the repository baseline Node.js 26.x for local Playwright, Bruno, and MCP workflows.

Every tool call should pass `workingDirectory: "playwright/typescript"` in the main checkout, or a sibling worktree path such as `"../orwellstat-330/playwright/typescript"`. The default `.` points at the repo root, which has no Playwright config and will fail.

#### Environment variables

| Variable          | Value in this repo | Description                                                                 |
| ----------------- | ------------------ | --------------------------------------------------------------------------- |
| `PW_ALLOWED_DIRS` | `".."`             | Authorizes sibling worktrees under the repo parent                          |
| `PW_RESULTS_FILE` | _(unset)_          | Optional absolute path override for `test-results/results.json` per call    |

#### Tools

| Tool                  | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `run_tests`           | Run the suite; return structured pass/fail summary                          |
| `get_run_status`      | Poll a background run started with `run_tests` and `wait: false`            |
| `get_failed_tests`    | Return failed tests from the last `results.json` without re-running          |
| `get_test_attachment` | Read a named text attachment for a failed test                              |
| `list_tests`          | List tests with spec file and tags without running them                     |

**`run_tests`** inputs: `workingDirectory`, `spec`, `browser` (`Chromium`, `Firefox`, `Webkit`, `Mobile Chrome`, `Mobile Safari`), `tag`, `timeout` (ms, default `300000`), `wait` (default `true`; set `false` for background runs), `updateSnapshots` (`all`, `changed`, `missing`, `none`), `headed`, `workers`, `retries`, `maxFailures`, `trace`.

When `wait` is `false`, the tool returns a `runId`. Poll **`get_run_status`** with that `runId` until `state` is terminal, then call **`get_failed_tests`** or **`get_test_attachment`** as needed.

**`get_run_status`** inputs: `runId` (optional), `workingDirectory` (optional; with `runId`, must match the run directory).

**`get_failed_tests`** inputs: `workingDirectory`.

**`get_test_attachment`** inputs: `workingDirectory`, `testTitle` (exact title from the report), `attachmentName` (e.g. `error-context`).

**`list_tests`** inputs: `workingDirectory`, `tag` (optional).

#### Excluding visual regression tests

`run_tests` exposes `tag` (`--grep`) but not `--grep-invert` yet. Visual tests live in `tests/visual.spec.ts` and share `@regression` with most of the suite, so a tag filter alone cannot drop only visual tests.

Supported patterns today:

- **Smoke subset:** `run_tests` with `tag: "@smoke"` (excludes visual and most regression depth).
- **Single spec:** `run_tests` with `spec: "tests/navigation.spec.ts"` (repeat per file as needed).
- **Visual only:** `run_tests` with `spec: "tests/visual.spec.ts"`.
- **Full non-visual suite:** iterate non-visual spec files under `tests/` (every `*.spec.ts` except `visual.spec.ts`), or use human/CI shell with `npx playwright test --grep-invert "visual regression"` — blocked for hooked assistants; prefer MCP per spec until upstream adds `grepInvert`.

Use **`list_tests`** to enumerate titles and spec files when planning multi-spec runs.

### playwright

Browser automation server from `@playwright/mcp`. It can navigate, click, evaluate, inspect snapshots, and take screenshots.

The server is launched on demand via `npx @playwright/mcp@0.0.68`. It requires Node.js and a network connection on first use. Additional tools beyond the common navigate/click/evaluate/snapshot/screenshot set may require confirmation depending on the assistant runtime.

Use it for live UI diagnostics and screenshots. Prefer `playwright-report-mcp` for running the test suite and retrieving structured results.

### MCP_DOCKER

Docker MCP gateway for interacting with Docker containers started by `act`.

| Tool       | Description                                  |
| ---------- | -------------------------------------------- |
| `mcp-exec` | Execute a command inside a running container |
| `mcp-find` | Find containers by name or label             |

### quality-metrics

Local MCP server in `mcp/quality-metrics/`. It exposes the same defect escape rate, MTTR, and metric history as [QUALITY_METRICS.md](../QUALITY_METRICS.md).

Build shared helpers first, then the server package:

```bash
(cd mcp/shared && npm install && npm run build)
(cd mcp/quality-metrics && npm install && npm run build)
```

The server runs through `node mcp/quality-metrics/dist/index.js`.

`get_defect_escape_rate` and `get_mttr` shell out to `scripts/generate-quality-metrics.py --json`, so returned values match the generated report. Local use requires authenticated `gh`.

| Tool                     | Description                                                            |
| ------------------------ | ---------------------------------------------------------------------- |
| `get_defect_escape_rate` | Return escape rate and bug counts by discovery label                   |
| `get_mttr`               | Return mean time to resolve for all closed bugs and by discovery label |
| `get_metrics_history`    | Return history from `quality-metrics-history.json`                     |

When no bug-labeled issues exist, tools return a clear "No bug issues found" message instead of dividing by zero.

### coverage-matrix

Local MCP server in `mcp/coverage-matrix/`. It exposes structured access to `playwright/typescript/coverage-matrix.json`.

Build shared helpers first, then the server package:

```bash
(cd mcp/shared && npm install && npm run build)
(cd mcp/coverage-matrix && npm install && npm run build)
```

The server runs through `node mcp/coverage-matrix/dist/index.js`.

Summary percentages match the Test Coverage Trends workflow because both compute over the same matrix sections. `mark_covered` writes the file with the existing two-space JSON formatting and trailing newline.

| Tool                   | Description                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `get_coverage_gaps`    | Return uncovered page categories and uncovered form names                           |
| `get_coverage_summary` | Return covered/total counts and percentages per active category, forms, and overall |
| `mark_covered`         | Flip one valid page-category cell to `true` and persist the matrix                  |

Valid categories for `mark_covered`: `title`, `content`, `accessibility`, `visualRegression`, `api`, `securityHeaders`, `negativePath`, `tracking`.

`mark_covered` does not flip forms. Forms are read-only through the MCP server.
