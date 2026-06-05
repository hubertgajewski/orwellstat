# Issue 583 Output Verbosity Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #583, which makes compact aggregate output the default and keeps the full token/dispatch table behind `--usage` or `--verbose`.

## Benchmark Scope

Issue #583 changes only the final aggregate text emitted after the specialist agents finish. It does not change which agents dispatch, which prompt frames they receive, the reviewed diff payload, cache behavior, or the cost of producing specialist agent results.

The prompt-input benchmarks from #580, #581, and #582 are not re-baselined in the output-only table. Their large prompt-footprint numbers include agent prompts plus fixture diffs, and are intentionally separate from this report's aggregate-output-footprint proxy.

For cross-issue comparison, use the generated epic matrix in `587-epic-token-cost-matrix.md`. That matrix recalculates every checkpoint from historical commits with the same fixture set and reports both incremental and cumulative deltas against `original-580`.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-582 -> post-583

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 2,033,514 | 2,028,565 | -4,949 (-0.24%) |
| Combined est. tokens | 508,384 | 507,147 | -1,237 (-0.24%) |

### Cumulative Delta: original-580 -> post-583

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,802,267 | 2,028,565 | -1,773,702 (-46.65%) |
| Combined est. tokens | 950,573 | 507,147 | -443,426 (-46.65%) |

## Estimated Output Token Proxy

Per the benchmark README's #583 policy, this report uses an output-footprint proxy when exact output tokens are unavailable. The proxy sums the aggregate output text that would be emitted before and after the change, then estimates tokens as `ceil(characters / 4)`.

The aggregate-output baseline column models the prior detailed aggregate: per-agent sections with pass/N/A checklist lines plus the full token/dispatch table. The aggregate-output compact column models the new default aggregate: findings, summary counts, skipped/unavailable rows, schema violations, readiness status, reuse counts, and one compact token total.

| Fixture | Aggregate-output baseline chars | Aggregate-output compact chars | Estimated baseline output tokens | Estimated compact output tokens | Delta | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `docs-only` | 3,530 | 1,086 | 883 | 272 | -611 (-69.20%) | deterministic output-footprint proxy |
| `playwright-test` | 4,364 | 1,083 | 1,091 | 271 | -820 (-75.16%) | deterministic output-footprint proxy |
| `workflow` | 4,362 | 1,016 | 1,091 | 254 | -837 (-76.72%) | deterministic output-footprint proxy |
| `mixed-typescript` | 4,917 | 1,094 | 1,230 | 274 | -956 (-77.72%) | deterministic output-footprint proxy |
| `script-code-only` | 3,572 | 1,091 | 893 | 273 | -620 (-69.43%) | deterministic output-footprint proxy |
| `large-diff` | 5,567 | 1,039 | 1,392 | 260 | -1,132 (-81.32%) | deterministic output-footprint proxy |
| `high-lines` | 5,567 | 1,039 | 1,392 | 260 | -1,132 (-81.32%) | deterministic output-footprint proxy |
| **Total** | **31,879** | **7,448** | **7,972** | **1,864** | **-6,108 (-76.62%)** | deterministic output-footprint proxy |

Proxy estimates are not billing data. They exclude prompt-input tokens, model-specific tokenization, harness overhead, conversation history, hidden tool framing, and the cost of producing the specialist agent results. They are useful here because #583 changes the visible aggregate output surface.

## Exact Runtime Token Status

Exact output tokens require captured Claude Code usage artifacts. Those artifacts are unavailable in this Codex run because Codex does not expose the Claude JSONL usage counters or sub-agent `<usage>` postscript consumed by the benchmark workflow.

Exact runtime output tokens are therefore recorded as unavailable for both baseline and compact output. This status is not the benchmark result; the comparable benchmark evidence is the epic matrix and deterministic output proxy above.

## Fixture-Based Validation

- `.claude/skills/deep-review-pro/SKILL.md` documents compact default output, `--usage`, `--verbose`, the compact token total, and the detailed token/dispatch table.
- Pass/fail/N/A specialist prompts document that compact aggregate mode may omit individual pass/N/A lines while the summary line preserves count evidence for auditability.
- Compact output still surfaces schema violations and treats them as blocking when the violated row's blocking metric cannot be trusted.
- The estimated output-token proxy covers all seven fixtures from `docs/deep-review-pro-benchmark/fixtures.json`.
- `587-epic-token-cost-matrix.md` records the comparable full-fixture, one-pass combined proxy for every #587 checkpoint.
- `scripts/test_benchmark_deep_review_pro.py` verifies the verbosity contract, pass/fail prompt guidance, and this report's before/after output-footprint proxy evidence.
