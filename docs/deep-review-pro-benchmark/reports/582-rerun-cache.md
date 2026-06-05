# Issue 582 Rerun Cache Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #582, which adds conservative reuse of unchanged non-blocking agent results during re-review convergence and requires a final full matching-agent pass before `status: ready`.

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

## Before/After Review Sequence Comparison

The baseline column reflects the pre-#582 convergence text, which re-dispatched every matching agent after each fix. The optimized column reflects the #582 cache contract in `.claude/skills/deep-review-pro/SKILL.md`.

The sequence models a `large-diff` review where each fix changes `docs/AI_ASSISTANTS.md` only. That invalidates the three always-on full-scope agents plus `deep-review-security` and `deep-review-docs`, while the six unaffected scoped specialists keep identical scoped prompt frames and can be reused until the final guard.

| Iteration | Baseline dispatched | Optimized dispatched | Optimized reused | Final full pass |
| --- | ---: | ---: | ---: | --- |
| 1 | 11 | 11 | 0 | no |
| 2 | 11 | 5 | 6 | no |
| 3 | 11 | 5 | 6 | no |
| final guard | 0 | 11 | 0 | yes |
| **Total** | **33** | **32** | **12** |  |

Interpretation:

- the targeted fix iterations dispatch 5 matching agents instead of all 11, a 54.55% dispatch-count reduction for those iterations
- the final guard deliberately spends one full matching-agent pass before readiness, so the three-iteration sequence drops from 33 to 32 dispatches, a 3.03% reduction
- exact token savings remain unavailable in this Codex-run report; dispatch counts are deterministic workflow evidence, not billing data

## Fixture-Based Validation

The local validation is fixture-based rather than a live Claude Code multi-agent run:

- `scripts/test_benchmark_deep_review_pro.py` verifies `.claude/skills/deep-review-pro/SKILL.md` documents the result reuse key, invalidation rules, `REUSED:` aggregate marker, and final full matching-agent pass.
- The same test module verifies this report records the #582 sequence table, including reused intermediate rows and the final guard row.
- Existing benchmark tests continue to verify the `large-diff` fixture dispatches all 11 roster agents.
