# Issue 582 Rerun Cache Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #582, which adds conservative reuse of unchanged non-blocking agent results during re-review convergence and requires a final full matching-agent pass before `status: ready`.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-581 -> post-582

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 2,052,458 | 2,053,428 | 970 (0.05%) |
| Combined est. tokens | 513,121 | 513,364 | 243 (0.05%) |

### Cumulative Delta: original-580 -> post-582

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,822,193 | 2,053,428 | -1,768,765 (-46.28%) |
| Combined est. tokens | 955,555 | 513,364 | -442,191 (-46.28%) |

## Harness

- Fixture source: `docs/deep-review-pro-benchmark/fixtures.json`
- Representative fixture: `large-diff`, because every specialist agent dispatches and the scenario can show unchanged scoped-agent reuse plus the final full matching pass.
- Validation command:

  ```bash
  python3 -m unittest scripts.test_benchmark_deep_review_pro
  ```

## Token Availability

Exact Claude sub-agent token usage is unavailable in this Codex run because the `multi_agent_v1` harness does not expose the Claude-style `<usage>` postscript consumed by `scripts/benchmark-deep-review-pro.py`.

Per the benchmark README's #582 policy, this report does not convert reused results to zero token cost as billing evidence. It records the deterministic review-sequence counts that the workflow now requires: dispatched, skipped, reused, and final full matching-pass counts per iteration.

## Exact Runtime Token Comparison

Exact runtime token fields are unavailable for both baseline and optimized runs in this Codex environment. The table is still explicit so the before/after token status is visible instead of implied by the dispatch table.

| Metric | Baseline | Optimized | Delta | Availability |
| --- | ---: | ---: | ---: | --- |
| Exact total tokens | unavailable | unavailable | unavailable | unavailable |
| Exact input tokens | unavailable | unavailable | unavailable | unavailable |
| Exact output tokens | unavailable | unavailable | unavailable | unavailable |
| Exact cache-read tokens | unavailable | unavailable | unavailable | unavailable |
| Exact cache-creation tokens | unavailable | unavailable | unavailable | unavailable |

## Prompt-Input Proxy Comparison

Because exact tokens are unavailable, this report includes a deterministic prompt-input proxy. The proxy follows `docs/deep-review-pro-benchmark/README.md`: for each dispatched agent, sum the specialist prompt file, roster domain string, and exact prompt frame sent to that agent, then estimate tokens as `ceil(characters / 4)`.

For #582, the proxy compares complete review sequences, not a single fixture pass:

- baseline sequence: three full matching-agent passes over `large-diff`
- optimized sequence: one full initial pass, two targeted rerun passes for the changed docs/full-scope agents, and one final full matching-agent guard pass
- targeted rerun pass: `deep-review-security`, `deep-review-simplification`, `deep-review-code`, `deep-review-architecture`, and `deep-review-docs`

| Metric | Baseline | Optimized | Delta | Availability |
| --- | ---: | ---: | ---: | --- |
| Prompt-input proxy chars | 382,107 | 366,276 | -15,831 (-4.14%) | deterministic proxy |
| Prompt-input proxy tokens | 95,527 | 91,569 | -3,958 (-4.14%) | deterministic proxy |

Per-pass proxy inputs:

| Pass type | Agents dispatched | Prompt chars | Est. tokens |
| --- | ---: | ---: | ---: |
| Full matching pass | 11 | 127,369 | 31,843 |
| Targeted rerun pass | 5 | 55,769 | 13,943 |

These proxy estimates are not billing data. They exclude model-specific tokenization, harness overhead, conversation history, model cache effects, and agent output tokens.

## Before/After Review Sequence Comparison

The baseline column reflects the pre-#582 convergence text, which re-dispatched every matching agent after each fix. The optimized column reflects the #582 cache contract in `.claude/skills/deep-review-pro/SKILL.md`.

The sequence models a `large-diff` review where each fix changes `docs/AI_ASSISTANTS.md` only. That invalidates the three always-on full-scope agents plus `deep-review-security` and `deep-review-docs`, while the six unaffected scoped specialists keep identical scoped prompt frames and can be reused until the final guard.

| Iteration | Baseline dispatched | Baseline skipped | Optimized dispatched | Optimized skipped | Optimized reused | Final full pass |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 11 | 0 | 11 | 0 | 0 | no |
| 2 | 11 | 0 | 5 | 0 | 6 | no |
| 3 | 11 | 0 | 5 | 0 | 6 | no |
| final guard | 0 | 0 | 11 | 0 | 0 | yes |
| **Total** | **33** | **0** | **32** | **0** | **12** |  |

Interpretation:

- the targeted fix iterations dispatch 5 matching agents instead of all 11, a 54.55% dispatch-count reduction for those iterations
- the final guard deliberately spends one full matching-agent pass before readiness, so the three-iteration sequence drops from 33 to 32 dispatches, a 3.03% reduction
- exact token savings remain unavailable in this Codex-run report; dispatch counts are deterministic workflow evidence, not billing data

## Fixture-Based Validation

The local validation is fixture-based rather than a live Claude Code multi-agent run:

- `scripts/test_benchmark_deep_review_pro.py` verifies `.claude/skills/deep-review-pro/SKILL.md` documents the result reuse key, invalidation rules, `REUSED:` aggregate marker, and final full matching-agent pass.
- The same test module verifies this report records the #582 sequence table, including reused intermediate rows and the final guard row.
- Existing benchmark tests continue to verify the `large-diff` fixture dispatches all 11 roster agents.
