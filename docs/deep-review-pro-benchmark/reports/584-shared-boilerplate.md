# Issue 584 Shared Boilerplate Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #584, which compacts duplicated specialist-agent boilerplate into `.claude/skills/deep-review-pro/SKILL.md::Shared specialist-agent contract` and keeps each agent file focused on domain-specific sources, categories, severity, and checklist deltas.

Checkpoint: `0d7add0` (`post-584`).

## Benchmark Scope

Issue #584 changes specialist agent prompt text only. It does not change dispatch triggers, per-agent prompt frames, aggregate output shape, cache behavior, or which agents dispatch for a given fixture. The prompt-footprint proxy below isolates agent-prompt compaction; aggregate output is unchanged from #583 compact mode.

For cross-issue comparison, use the generated epic matrix in `587-epic-token-cost-matrix.md`. That matrix recalculates every checkpoint from historical commits with the same fixture set and reports both incremental and cumulative deltas against `original-580`.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-583 -> post-584

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 2,037,880 | 1,975,708 | -62,172 (-3.05%) |
| Combined est. tokens | 509,477 | 493,934 | -15,543 (-3.05%) |

### Cumulative Delta: original-580 -> post-584

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,822,193 | 1,975,708 | -1,846,485 (-48.31%) |
| Combined est. tokens | 955,555 | 493,934 | -461,621 (-48.31%) |

## Harness

- Fixture source: `docs/deep-review-pro-benchmark/fixtures.json`
- Checkpoint ref: `0d7add0`
- Validation command:

  ```bash
  python3 -m unittest scripts.test_benchmark_deep_review_pro scripts.test_benchmark_deep_review_epic_matrix
  ```

- Prompt-footprint proxy basis:
  - before: post-583 specialist prompts with duplicated manifest, untrusted-content, evidence, sibling-ownership, confidence, citation, and H/M/L schema prose
  - after: post-584 prompts that reference `§ Shared specialist-agent contract` in `.claude/skills/deep-review-pro/SKILL.md` and keep only agent-local deltas
  - both sides use the same scoped prompt frames, dispatch contract, and compact aggregate output so the table isolates agent-prompt size
  - token estimate: `ceil(characters / 4)` per the benchmark README Cost Proxy Policy

## Token Availability

Exact runtime token usage is unavailable in Codex because Codex does not expose the Claude `<usage>` postscript or the Claude JSONL usage counters consumed by `scripts/benchmark-deep-review-pro.py`. The table below is a deterministic prompt-input proxy, not billing data. It excludes model-specific tokenization, harness overhead, cache behavior, conversation history, hidden system/tool framing, and output tokens.

## Prompt-Footprint Estimate

| Fixture | Prompt chars before | Prompt chars after | Est. tokens before | Est. tokens after | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 38,346 | 34,659 | 9,587 | 8,665 | -922 (-9.62%) |
| `playwright-test` | 62,246 | 54,885 | 15,562 | 13,722 | -1,840 (-11.82%) |
| `workflow` | 75,125 | 68,720 | 18,782 | 17,180 | -1,602 (-8.53%) |
| `mixed-typescript` | 87,248 | 78,535 | 21,812 | 19,634 | -2,178 (-9.99%) |
| `script-code-only` | 69,935 | 61,321 | 17,484 | 15,331 | -2,153 (-12.31%) |
| `large-diff` | 128,449 | 114,753 | 32,113 | 28,689 | -3,424 (-10.66%) |
| `high-lines` | 1,564,970 | 1,551,274 | 391,243 | 387,819 | -3,424 (-0.88%) |
| **Total** | **2,026,319** | **1,964,147** | **506,583** | **491,040** | **-15,543 (-3.07%)** |

Interpretation:

- representative set excluding `high-lines`: estimated prompt-input proxy drops from 115,340 to 103,221 tokens, a 10.51% reduction
- `high-lines`: estimated prompt-input proxy drops by 3,424 tokens (0.88%) because the shared contract compacts repeated prose across all eleven dispatched agents while the scoped diff payload still dominates
- full fixture set including `high-lines`: estimated prompt-input proxy drops from 506,583 to 491,040 tokens, a 3.07% reduction

## Fixture-Based Validation

`scripts/test_benchmark_deep_review_pro.py` verifies:

- `.claude/skills/deep-review-pro/SKILL.md` documents the `## Shared specialist-agent contract` section with prompt-frame safety, evidence-before-findings, sibling ownership, confidence threshold, citations, and no-remediation rules
- every specialist prompt references `§ Shared specialist-agent contract` instead of duplicating the shared manifest and untrusted-content wording
- every H/M/L specialist prompt references the shared recount invariant instead of duplicating the output-schema rule
- dispatch, scoped prompt frames, and compact aggregate output remain unchanged from post-583
