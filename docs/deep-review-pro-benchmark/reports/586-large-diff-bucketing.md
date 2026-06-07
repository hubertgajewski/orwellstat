# Issue 586 Large-Diff Bucketing Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #586, which adds orchestrator-level large-diff risk bucketing when changed lines exceed 3000, metadata-only hunks for low-risk and generated paths, and a `### large-diff-bucketing` aggregate section that blocks `status: ready` while `partial-review: yes`.

Checkpoint: `21373dc` (`post-586`).

## Benchmark Scope

Issue #586 changes prompt-frame construction and aggregate output when `CHANGED_LINE_COUNT` exceeds 3000. Dispatch (`dispatch-static-v1`) is unchanged. The prompt-footprint proxy uses `scoped-bucketed-v1`; combined totals also include the `compact-static-bucketed-v1` aggregate proxy with static pre-pass and large-diff-bucketing sections.

For cross-issue comparison, use the generated epic matrix in `587-epic-token-cost-matrix.md`.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-585 -> post-586

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 1,961,710 | 537,746 | -1,423,964 (-72.59%) |
| Combined est. tokens | 490,433 | 134,442 | -355,991 (-72.59%) |

### Cumulative Delta: original-580 -> post-586

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,822,193 | 537,746 | -3,284,447 (-85.93%) |
| Combined est. tokens | 955,555 | 134,442 | -821,113 (-85.93%) |

## Harness

- Fixture source: `docs/deep-review-pro-benchmark/fixtures.json`
- Stress fixture: `high-lines` (synthetic 3025-line doc payload plus normal/high-risk siblings)
- Validation command:

  ```bash
  python3 -m unittest scripts.test_benchmark_deep_review_pro scripts.test_benchmark_deep_review_epic_matrix
  ```

## Prompt-Footprint Estimate

| Fixture | Prompt chars before | Prompt chars after | Est. tokens before | Est. tokens after | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 34,659 | 34,659 | 8,665 | 8,665 | 0 (0.00%) |
| `playwright-test` | 54,084 | 54,084 | 13,521 | 13,521 | 0 (0.00%) |
| `workflow` | 58,584 | 58,584 | 14,646 | 14,646 | 0 (0.00%) |
| `mixed-typescript` | 77,549 | 77,549 | 19,388 | 19,388 | 0 (0.00%) |
| `script-code-only` | 61,461 | 61,461 | 15,366 | 15,366 | 0 (0.00%) |
| `large-diff` | 111,983 | 111,933 | 27,996 | 27,984 | -12 (-0.04%) |
| `high-lines` | 1,548,504 | 124,516 | 387,126 | 31,129 | -355,997 (-91.96%) |
| **Total** | **1,946,824** | **522,614** | **486,708** | **130,656** | **-356,052 (-73.16%)** |

Interpretation:

- representative set excluding `high-lines`: estimated prompt-input proxy is effectively flat
- `high-lines`: metadata-only treatment for the synthetic doc and spec paths drops estimated prompt-input proxy from 387,126 to 31,129 tokens, a 91.96% reduction
- full fixture set including `high-lines`: estimated prompt-input proxy drops from 486,708 to 130,656 tokens, a 73.16% reduction

## Large-Diff Aggregate-Output Proxy

The `high-lines` fixture emits `partial-review: yes` and `status: blocked` because low-risk buckets use metadata-only inline hunks. Smaller fixtures stay below the 3000-line threshold and omit the bucketing section.

| Fixture | Aggregate chars before | Aggregate chars after | Est. tokens before | Est. tokens after | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `high-lines` | 2,133 | 2,333 | 534 | 584 | 50 (9.36%) |
| all other fixtures | unchanged | unchanged | unchanged | unchanged | 0 |

The added aggregate text is the `### large-diff-bucketing` section plus `large-diff-partial` in the aggregate `total:` line.

## Fixture-Based Validation

`scripts/test_benchmark_deep_review_pro.py` verifies:

- `.claude/skills/deep-review-pro/SKILL.md` documents `## Large-diff risk bucketing`, `CHANGED_LINE_COUNT`, and `large-diff-partial` readiness rules
- `scripts/deep_review_benchmark_support.py` implements `plan_large_diff_bucketing_v1` and `build_scoped_prompt_frames_bucketed_v1`
- bucketed `high-lines` prompt frames are smaller than scoped frames while dispatch remains full roster
- `scripts/test_benchmark_deep_review_epic_matrix.py` pins `post-586` with `scoped-bucketed-v1` and `compact-static-bucketed-v1` contracts
