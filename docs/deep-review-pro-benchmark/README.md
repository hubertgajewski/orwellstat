# deep-review-pro Token Benchmark

This directory contains repeatable benchmark fixtures for measuring `/deep-review-pro` token usage before and after prompt or dispatch optimizations.

## Fixtures

`fixtures.json` records the expected dispatch shape for each representative scope:

| Fixture | Scope | Expected shape |
| --- | --- | --- |
| `docs-only` | Documentation-only diff | Always-on agents dispatch; TypeScript, Python, CI, QA, and unit-test agents skip |
| `playwright-test` | Playwright spec diff | TypeScript and QA agents dispatch in addition to always-on agents |
| `workflow` | GitHub Actions workflow diff | CI agent dispatches in addition to always-on agents |
| `mixed-typescript` | Playwright utility plus MCP TypeScript diff | TypeScript and unit-test agents dispatch in addition to always-on agents |
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

The harness intentionally does not invoke Claude Code. It normalizes captured artifacts so optimization branches can compare the same fixture set without relying on live session state.

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
