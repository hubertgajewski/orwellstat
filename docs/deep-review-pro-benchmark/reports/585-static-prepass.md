# Issue 585 Static Pre-Pass Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #585, which adds a deterministic static pre-pass before specialist dispatch, tightens `deep-review-project-checklist` dispatch with static path heuristics, and emits a compact `### static-pre-pass` section before per-agent aggregate output.

Checkpoint: `825069c` (`post-585`).

## Benchmark Scope

Issue #585 changes three cost surfaces:

1. **Dispatch (`dispatch-static-v1`)** — `deep-review-project-checklist` now uses static path heuristics, so some low-risk workflow diffs skip that agent when no Playwright/POM/fixture/tag/path-alias/loadEnv surface is present.
2. **Prompt input** — unchanged specialist prompt frames for most fixtures; dispatch-count reductions lower total prompt footprint where an agent is skipped.
3. **Aggregate output (`compact-static-v1`)** — the orchestrator emits a compact static-pre-pass section before specialist sections. The epic matrix includes this aggregate-output proxy in combined totals from #585 onward.

For cross-issue comparison, use the generated epic matrix in `587-epic-token-cost-matrix.md`. That matrix recalculates every checkpoint from historical commits with the same fixture set and reports both incremental and cumulative deltas against `original-580`.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-584 -> post-585

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 1,975,708 | 1,961,710 | -13,998 (-0.71%) |
| Combined est. tokens | 493,934 | 490,433 | -3,501 (-0.71%) |

### Cumulative Delta: original-580 -> post-585

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,822,193 | 1,961,710 | -1,860,483 (-48.68%) |
| Combined est. tokens | 955,555 | 490,433 | -465,122 (-48.68%) |

## Harness

- Fixture source: `docs/deep-review-pro-benchmark/fixtures.json`
- Checkpoint ref: `825069c`
- Validation command:

  ```bash
  python3 -m unittest scripts.test_benchmark_deep_review_pro scripts.test_benchmark_deep_review_epic_matrix
  ```

## Token Availability

Exact runtime token usage is unavailable in Codex because Codex does not expose the Claude `<usage>` postscript or the Claude JSONL usage counters consumed by `scripts/benchmark-deep-review-pro.py`. The tables below use deterministic proxies per the benchmark README Cost Proxy Policy. They are not billing data.

## Prompt-Input Proxy Comparison

| Fixture | Prompt chars before | Prompt chars after | Est. tokens before | Est. tokens after | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 34,659 | 34,659 | 8,665 | 8,665 | 0 (0.00%) |
| `playwright-test` | 54,885 | 54,084 | 13,722 | 13,521 | -201 (-1.46%) |
| `workflow` | 68,720 | 58,584 | 17,180 | 14,646 | -2,534 (-14.75%) |
| `mixed-typescript` | 78,535 | 77,549 | 19,634 | 19,388 | -246 (-1.25%) |
| `script-code-only` | 61,321 | 61,461 | 15,331 | 15,366 | 35 (0.23%) |
| `large-diff` | 114,753 | 111,983 | 28,689 | 27,996 | -693 (-2.42%) |
| `high-lines` | 1,551,274 | 1,548,504 | 387,819 | 387,126 | -693 (-0.18%) |
| **Total** | **1,964,147** | **1,946,824** | **491,040** | **486,708** | **-4,332 (-0.88%)** |

Interpretation:

- representative set excluding `high-lines`: estimated prompt-input proxy drops from 103,221 to 99,582 tokens, a 3.53% reduction
- `workflow` drives most of the dispatch savings: `deep-review-project-checklist` is skipped when the diff touches only `.github/workflows/**` without Playwright/POM/fixture/tag/path-alias/loadEnv surfaces
- full fixture set including `high-lines`: estimated prompt-input proxy drops from 491,040 to 486,708 tokens, a 0.88% reduction

## Static Pre-Pass Aggregate-Output Proxy

Per the benchmark README's #585 policy, the combined epic matrix includes the compact static-pre-pass section in aggregate-output totals. The proxy sums the emitted `### static-pre-pass` block plus the unchanged compact per-agent aggregate for each fixture.

| Fixture | Aggregate chars before | Aggregate chars after | Est. tokens before | Est. tokens after | Delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 1,665 | 2,103 | 417 | 526 | 109 (26.14%) |
| `playwright-test` | 1,610 | 2,114 | 403 | 529 | 126 (31.27%) |
| `workflow` | 1,745 | 2,134 | 437 | 534 | 97 (22.20%) |
| `mixed-typescript` | 1,740 | 2,226 | 435 | 557 | 122 (28.05%) |
| `script-code-only` | 1,605 | 2,043 | 402 | 511 | 109 (27.11%) |
| `large-diff` | 1,598 | 2,133 | 400 | 534 | 134 (33.50%) |
| `high-lines` | 1,598 | 2,133 | 400 | 534 | 134 (33.50%) |
| **Total** | **11,561** | **14,886** | **2,894** | **3,725** | **831 (28.71%)** |

The static section adds deterministic orchestrator output but consumes no sub-agent LLM tokens. Net combined savings come from dispatch and prompt-input reductions outweighing the added aggregate text on most fixtures.

## Dispatch Comparison

The `workflow` fixture shows the clearest dispatch change from `dispatch-static-v1`:

| Fixture | Agents dispatched before | Agents dispatched after | Notable change |
| --- | ---: | ---: | --- |
| `workflow` | 7 | 6 | `deep-review-project-checklist` skipped when only CI workflow files change |
| all other fixtures | unchanged | unchanged | static path heuristics do not alter dispatch for the current fixture set |

Full-fixture dispatch totals: 53 dispatched / 24 skipped before; 52 dispatched / 25 skipped after.

## Fixture-Based Validation

`scripts/test_benchmark_deep_review_pro.py` verifies:

- `.claude/skills/deep-review-pro/SKILL.md` documents `## Static pre-pass`, the `### static-pre-pass` aggregate schema, `dispatch-static-v1` ownership cleanup, and static `status: blocked` rules for `static-fail` and `static-unavailable-blocking`
- `scripts/deep_review_benchmark_support.py` implements `dispatch_matches_static_v1`, static project-checklist path heuristics, and credential-line regex behavior that ignores static-pre-pass prose
- `scripts/test_benchmark_deep_review_epic_matrix.py` pins `post-585` to `825069c` with `dispatch-static-v1` and `compact-static-v1` contracts
- `587-epic-token-cost-matrix.md` records the comparable full-fixture, one-pass combined proxy for every #587 checkpoint
