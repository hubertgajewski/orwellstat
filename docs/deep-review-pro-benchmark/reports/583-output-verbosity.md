# Issue 583 Output Verbosity Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #583, which makes compact aggregate output the default and keeps the full token/dispatch table behind `--usage` or `--verbose`.

## Benchmark Scope

Issue #583 changes the final aggregate text emitted after the specialist agents finish. It does not change which agents dispatch, the reviewed diff payload, cache behavior, or the cost of producing specialist agent results. The output-only table below isolates aggregate-output text; the small prompt-input increase from #583 prompt-guidance edits is captured in the epic matrix above.

The prompt-input benchmarks from #580, #581, and #582 are not re-baselined in the output-only table. Their large prompt-footprint numbers include agent prompts plus fixture diffs, and are intentionally separate from this report's aggregate-output-footprint proxy.

For cross-issue comparison, use the generated epic matrix in `587-epic-token-cost-matrix.md`. That matrix recalculates every checkpoint from historical commits with the same fixture set and reports both incremental and cumulative deltas against `original-580`.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-582 -> post-583

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 2,053,428 | 2,037,880 | -15,548 (-0.76%) |
| Combined est. tokens | 513,364 | 509,477 | -3,887 (-0.76%) |

### Cumulative Delta: original-580 -> post-583

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,822,193 | 2,037,880 | -1,784,313 (-46.68%) |
| Combined est. tokens | 955,555 | 509,477 | -446,078 (-46.68%) |

## Estimated Output Token Proxy

Per the benchmark README's #583 policy, this report uses an output-footprint proxy when exact output tokens are unavailable. The proxy sums the aggregate output text that would be emitted before and after the change, then estimates tokens as `ceil(characters / 4)`.

The aggregate-output baseline column models the historical post-582 detailed aggregate: per-agent sections with pass/N/A checklist lines, skipped sections, aggregate total/status/reuse lines, the detailed token table including historical skipped rows, and the iteration footer. The aggregate-output compact column models the new default aggregate: findings or empty-state lines, summary counts, skipped/unavailable sections, readiness status, reuse counts, and one compact token total.

| Fixture | Aggregate-output baseline chars | Aggregate-output compact chars | Estimated baseline output tokens | Estimated compact output tokens | Delta | Availability |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `docs-only` | 4,331 | 1,665 | 1,083 | 417 | -666 (-61.50%) | deterministic output-footprint proxy |
| `playwright-test` | 4,449 | 1,610 | 1,113 | 403 | -710 (-63.79%) | deterministic output-footprint proxy |
| `workflow` | 4,722 | 1,745 | 1,181 | 437 | -744 (-63.00%) | deterministic output-footprint proxy |
| `mixed-typescript` | 4,936 | 1,740 | 1,234 | 435 | -799 (-64.75%) | deterministic output-footprint proxy |
| `script-code-only` | 4,157 | 1,605 | 1,040 | 402 | -638 (-61.35%) | deterministic output-footprint proxy |
| `large-diff` | 4,849 | 1,598 | 1,213 | 400 | -813 (-67.02%) | deterministic output-footprint proxy |
| `high-lines` | 4,849 | 1,598 | 1,213 | 400 | -813 (-67.02%) | deterministic output-footprint proxy |
| **Total** | **32,293** | **11,561** | **8,077** | **2,894** | **-5,183 (-64.17%)** | deterministic output-footprint proxy |

Proxy estimates are not billing data. They exclude prompt-input tokens, model-specific tokenization, harness overhead, conversation history, hidden tool framing, and the cost of producing the specialist agent results. They are useful here because #583 changes the visible aggregate output surface.

## Exact Runtime Token Status

Exact output tokens require captured Claude Code usage artifacts. Those artifacts are unavailable in this Codex run because Codex does not expose the Claude JSONL usage counters or sub-agent `<usage>` postscript consumed by the benchmark workflow.

Exact runtime output tokens are therefore recorded as unavailable for both baseline and compact output. This status is not the benchmark result; the comparable benchmark evidence is the epic matrix and deterministic output proxy above.

## Fixture-Based Validation

- `.claude/skills/deep-review-pro/SKILL.md` documents compact default output, `--usage`, `--verbose`, the compact token total, and the detailed token/dispatch table.
- Pass/fail/N/A specialist prompts keep their local `Failures: none.` sentinel contracts; compact aggregate behavior is centralized in `.claude/skills/deep-review-pro/SKILL.md`.
- Compact output still surfaces schema violations and treats them as blocking when the violated row's blocking metric cannot be trusted.
- The estimated output-token proxy covers all seven fixtures from `docs/deep-review-pro-benchmark/fixtures.json`.
- `587-epic-token-cost-matrix.md` records the comparable full-fixture, one-pass combined proxy for every #587 checkpoint.
- `scripts/test_benchmark_deep_review_pro.py` verifies the verbosity contract, centralized pass/fail aggregate policy, and this report's before/after output-footprint proxy evidence.
