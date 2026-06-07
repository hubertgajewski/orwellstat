# deep-review-pro Token Benchmark

This directory contains repeatable benchmark fixtures for measuring `/deep-review-pro` token-cost changes across prompt framing, dispatch, rerun/cache, and aggregate-output optimizations.

## Fixtures

`fixtures.json` records the expected dispatch shape for each representative scope:

| Fixture | Scope | Expected shape |
| --- | --- | --- |
| `docs-only` | Documentation-only diff | Docs dispatches; security and project-checklist skip with TypeScript, Python, CI, QA, and unit-test agents |
| `playwright-test` | Playwright spec diff | Project-checklist, TypeScript, and QA dispatch; docs, security, Python, CI, and unit-test agents skip |
| `workflow` | GitHub Actions workflow diff | Security, docs, and CI dispatch with the always-on agents; project-checklist skips workflow-only scope |
| `mixed-typescript` | Playwright utility plus MCP TypeScript diff | Security, project-checklist, docs, TypeScript, and unit-test dispatch |
| `script-code-only` | Existing non-Playwright Python script diff | Security, Python, and unit-test dispatch; project-checklist and docs skip |
| `large-diff` | Docs, Python script, Playwright test, and workflow diff | Every specialist dispatches |
| `high-lines` | Synthetic 3,000+ line docs, Python, TypeScript, Playwright test, and workflow diff | Every specialist dispatches; stresses high-line-count review behavior |

The `.diff` files in `fixtures/` are stable scope inputs. For controlled benchmark runs, apply one fixture in a disposable worktree so `/deep-review-pro` reviews it through normal local-diff mode, then reset the worktree before applying the next fixture. Do not pass the fixture text as a freeform `/deep-review-pro` argument; freeform mode is reserved for reviewer bias over the current local diff.

`high-lines.diff` is generated on demand to avoid committing a repetitive 3,000+ line payload:

```bash
python3 scripts/generate-deep-review-high-lines-fixture.py \
  --out docs/deep-review-pro-benchmark/fixtures/high-lines.diff
```

## Capturing Runs

Create one directory for the baseline run and one for the optimized run. Each run directory should contain a subdirectory per fixture:

```text
benchmark-runs/
  before/
    docs-only/
      orchestrator-before.json
      orchestrator-after.json
      agents/
        deep-review-security.txt
        deep-review-project-checklist.txt
        ...
  after/
    docs-only/
      orchestrator-before.json
      orchestrator-after.json
      agents/
        deep-review-security.txt
        deep-review-project-checklist.txt
        ...
```

For each fixture:

1. Snapshot the current Claude JSONL usage counters to `orchestrator-before.json`.
2. Run `/deep-review-pro` against the fixture scope.
3. Snapshot the same counters to `orchestrator-after.json`.
4. Save each dispatched agent result, including its trailing `<usage>` postscript, as `agents/<agent>.txt`.
5. Do not create files for skipped agents; skipped counts come from `fixtures.json`.

The preferred orchestrator snapshot files use Claude's raw counter names:

```json
{
  "input_tokens": 1200,
  "output_tokens": 400,
  "cache_read_input_tokens": 10000,
  "cache_creation_input_tokens": 300
}
```

Create each snapshot from the active Claude JSONL log with:

```bash
jq -s '
  map(select(.message.usage) | .message.usage)
  | {
      input_tokens: (if all(has("input_tokens")) then map(.input_tokens) | add else null end),
      output_tokens: (if all(has("output_tokens")) then map(.output_tokens) | add else null end),
      cache_read_input_tokens: (if all(has("cache_read_input_tokens")) then map(.cache_read_input_tokens) | add else null end),
      cache_creation_input_tokens: (if all(has("cache_creation_input_tokens")) then map(.cache_creation_input_tokens) | add else null end)
    }
' "$SESSION_LOG" > orchestrator-before.json
```

Run the same command after `/deep-review-pro` and write `orchestrator-after.json`.

When both snapshot files are present, the harness subtracts `before` from `after` and records only the controlled invocation's delta. For older captured runs, a single `orchestrator.jsonl` or `session.jsonl` file is still supported, but that fallback is cumulative for the saved log and should only be used for an isolated fresh Claude session.

The harness intentionally does not invoke Claude Code. It normalizes captured artifacts so optimization branches can compare the same fixture set without relying on live session state. Shared fixture validation and prompt-frame helpers live in `scripts/deep_review_benchmark_support.py`; both benchmark CLIs use that support module so prompt-frame construction cannot drift between report generators.

## Generating Reports

Run:

```bash
python3 scripts/benchmark-deep-review-pro.py \
  --before benchmark-runs/before \
  --after benchmark-runs/after \
  --out-dir benchmark-runs/report
```

The command writes:

- `deep-review-pro-benchmark.json` for machine-readable fixture, before, and after data.
- `deep-review-pro-benchmark.csv` for spreadsheet-friendly deltas.
- `deep-review-pro-benchmark.md` for the human-readable summary.

## Recorded Reports

Issue-specific benchmark reports can be stored under `reports/` when a workflow change needs durable review evidence. Each report should name the fixture set, before/after basis, exact commands or harness limitation, and whether token fields are exact, best-effort, or unavailable.

For the #587 optimization epic, issue-specific reports must also include the generated `## Epic Comparable Benchmark` section from `reports/587-epic-token-cost-matrix.md`. That section is the comparable surface across child stories. Story-specific prompt-only, output-only, dispatch-only, or rerun/cache tables may appear below it, but they must not replace it.

## Epic Matrix Policy

The #587 epic uses fixed checkpoints:

| Checkpoint | Meaning |
| --- | --- |
| `original-580` | Baseline after #579 and before #580 |
| `post-580` | After #580 conditional dispatch |
| `post-581` | After #581 agent-specific subdiffs |
| `post-582` | After #582 rerun cache contract |
| `post-583` | After #583 compact aggregate output |
| `post-584` | After #584 shared-boilerplate compaction |
| `post-585` | After #585 static pre-pass and ownership cleanup |
| `post-586` | After #586 large-diff risk bucketing |

Every child story in #587 must report two comparable deltas:

- **Incremental delta**: previous checkpoint to this story's checkpoint.
- **Cumulative delta**: `original-580` to this story's checkpoint.

The comparable tables must use the same fixture set and these columns:

```text
Combined chars before
Combined chars after
Char delta
Combined est. tokens before
Combined est. tokens after
Token delta
```

The matrix recalculation command is:

```bash
python3 scripts/benchmark_deep_review_epic_matrix.py
```

This writes:

- `reports/587-epic-token-cost-matrix.md`
- `reports/587-epic-token-cost-matrix.json`

For a later child story, first add or update that story's checkpoint in `scripts/benchmark_deep_review_epic_matrix.py::DEFAULT_CHECKPOINTS`, including the previous checkpoint link and the output mode. `WORKTREE` or `HEAD` may appear only while preparing the active final checkpoint; `WORKTREE` reads the current files directly, while `HEAD` reads committed files via `git show`. Before treating the report as durable evidence after merge, pin the completed checkpoint to a stable commit ref. Then run the matrix command above.

Each checkpoint also pins the prompt-frame and aggregate-output contract used for that historical row. Do not let a current helper change retroactively alter earlier checkpoints; add a new contract value when a child story changes prompt framing or aggregate output shape.

To print the generated section for an issue report:

```bash
python3 scripts/benchmark_deep_review_epic_matrix.py --issue-section 583
```

Validate the matrix generator with:

```bash
python3 scripts/test_benchmark_deep_review_epic_matrix.py
```

The matrix is generated from historical checkpoint commits with `git show`, except an active final `WORKTREE` checkpoint, which reads current files directly before the branch is committed. Every checkpoint uses the same current fixture set. This supersedes any older report-local proxy that used a different fixture set, unit, or branch-local prompt text. If a historical report contains a value such as `Prompt Chars Before`, do not compare it to a later `est. tokens` value; use the generated matrix's combined chars and combined estimated tokens instead.

## Cost Proxy Policy

Exact `total_tokens` from captured Claude usage is the preferred cost metric. When exact token usage is unavailable, record it as unavailable and add only the proxy that matches the story's cost surface:

- Dispatch and prompt-input changes (#580, #581, #584, #585, #586): use the prompt-footprint proxy. Sum, for each dispatched agent, the agent prompt text, roster domain string, and the exact prompt frame sent to that agent. Estimate tokens as `ceil(characters / 4)`. If a story changes per-agent subdiffs, use the per-agent prompt frame, not the full fixture diff. For #585, include the `compact-static-v1` aggregate-output proxy (static pre-pass only) in the combined epic matrix. For #586, use `compact-static-bucketed-v1`, which adds `### large-diff-bucketing` and `large-diff-partial` to that static section when the 3000-line threshold is exceeded. Report the same three totals when they apply: affected fixtures, representative set excluding `high-lines`, and full fixture set.
- Output verbosity changes (#583): use an output-footprint proxy only when exact output tokens are unavailable. Sum the aggregate output text that would be emitted before and after, estimate tokens as `ceil(characters / 4)`, and keep this separate from prompt-input estimates.
- Rerun/cache changes (#582): compare complete review sequences, not a single fixture pass. Record dispatched, skipped, reused, and final full matching-pass counts per iteration. If exact tokens are unavailable, do not convert reused results to zero token cost unless the harness proves no model call occurred.

Proxy estimates are not billing data. They exclude model-specific tokenization, harness overhead, cache behavior, conversation history, and hidden system/tool framing. Use them as deterministic before/after evidence only when the exact usage fields are unavailable.

## Field Accuracy

Exact fields:

- `dispatched_agents` and `skipped_agents` come from `fixtures.json`.
- Sub-agent `total_tokens`, `tool_uses`, and `duration_ms` are exact when the saved agent output includes a numeric `<usage>` postscript.
- Orchestrator `input`, `output`, `cache_read`, and `cache_creation` are exact when both counter snapshots are present and numeric, or when every JSONL `message.usage` record in the fallback log includes the corresponding Claude usage field.

Best-effort or unavailable fields:

- Orchestrator usage depends on Claude Code's undocumented JSONL location and schema. If a snapshot or fallback log is missing, unreadable, invalid, or lacks a field, the harness reports that field as `unavailable`.
- Sub-agent usage depends on the undocumented `<usage>` postscript. If the postscript or one of its numeric fields is missing, the harness reports that field as `unavailable`.
- `total_tokens` combines orchestrator input/output with sub-agent totals. If any contributing field is unavailable, the total is also unavailable instead of treating the missing value as zero.
- `wall_clock_ms` is the sum of sub-agent `duration_ms` values. It does not include top-level orchestration time unless Claude exposes that time in future artifacts.
