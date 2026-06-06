# Issue 581 Agent-Specific Subdiff Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #581, which changes dispatched specialist agents from a shared full-diff prompt frame to per-agent prompt frames. Broad reviewers keep the full diff; file specialists receive matching hunks plus a complete `<changed-files>` manifest.

## Epic Comparable Benchmark

These rows are generated from `587-epic-token-cost-matrix.md` so this issue can be compared with every other #587 child story using the same units.

Use this section for cross-ticket comparison. Story-specific tables below are retained as local evidence and may use a narrower prompt-only, output-only, dispatch-only, or rerun/cache proxy surface.

### Incremental Delta: post-580 -> post-581

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,767,358 | 2,052,458 | -1,714,900 (-45.52%) |
| Combined est. tokens | 941,845 | 513,121 | -428,724 (-45.52%) |

### Cumulative Delta: original-580 -> post-581

| Metric | Original #580 baseline | Current checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Combined chars | 3,822,193 | 2,052,458 | -1,769,735 (-46.30%) |
| Combined est. tokens | 955,555 | 513,121 | -442,434 (-46.30%) |

## Harness

- Fixture source: `docs/deep-review-pro-benchmark/fixtures.json`
- Validation command:

  ```bash
  python3 scripts/test_benchmark_deep_review_pro.py
  ```

- Prompt-footprint proxy basis:
  - before: every dispatched agent receives the full fixture diff in `<untrusted-diff>`
  - after: `security`, `simplification`, `code`, and `architecture` receive the full diff; scoped specialists receive relevant hunks plus `<changed-files>`
  - both sides use the current agent prompts and roster domain strings so the table isolates prompt-frame size from explanatory prompt prose edits
  - token estimate: `ceil(characters / 4)` per the benchmark README Cost Proxy Policy

## Token Availability

Exact runtime token usage is unavailable in Codex because Codex does not expose the Claude `<usage>` postscript or the Claude JSONL usage counters consumed by `scripts/benchmark-deep-review-pro.py`. The table below is a deterministic prompt-input proxy, not billing data. It excludes model-specific tokenization, harness overhead, cache behavior, conversation history, hidden system/tool framing, and output tokens.

## Prompt-Footprint Estimate

| Fixture | Agents | Prompt Chars Before | Prompt Chars After | Est. Tokens Before | Est. Tokens After | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 4 | 37,656 | 37,916 | 9,414 | 9,479 | 65 |
| `playwright-test` | 6 | 60,952 | 61,456 | 15,238 | 15,364 | 126 |
| `workflow` | 7 | 73,631 | 74,191 | 18,408 | 18,548 | 140 |
| `mixed-typescript` | 8 | 85,659 | 86,098 | 21,415 | 21,525 | 110 |
| `script-code-only` | 6 | 68,815 | 69,217 | 17,204 | 17,305 | 101 |
| `large-diff` | 11 | 128,951 | 126,795 | 32,238 | 31,699 | -539 |
| `high-lines` | 11 | 3,276,733 | 1,563,316 | 819,184 | 390,829 | -428,355 |
| **Total** | **53** | **3,732,397** | **2,018,989** | **933,101** | **504,749** | **-428,352** |

Interpretation:

- high-line stress fixture: estimated prompt-input proxy drops from 819,184 to 390,829 tokens, a 52.29% reduction
- representative set excluding `high-lines`: estimated prompt-input proxy is effectively flat, 113,917 to 113,920 tokens, because the manifest and trusted-preamble overhead offsets savings on tiny fixture hunks
- full fixture set including `high-lines`: estimated prompt-input proxy drops from 933,101 to 504,749 tokens, a 45.91% reduction

## Fixture Validation

`scripts/test_benchmark_deep_review_pro.py` verifies:

- `.claude/skills/deep-review-pro/SKILL.md` documents `CHANGED_FILES`, `<changed-files>`, `PROMPT_FRAME_<Agent>`, and the shared contract that scoped diffs may omit unrelated hunks
- the master roster owns each agent's prompt scope, with broad agents (`security`, `simplification`, `code`, and `architecture`) marked as full-diff recipients and scoped specialists marked as relevant-hunk recipients
- every specialist prompt references the shared `PROMPT_FRAME` contract instead of duplicating the manifest and untrusted-content wording
- every H/M/L specialist prompt references the shared recount invariant instead of duplicating the output-schema rule
- the benchmark helper builds mixed-diff prompt frames that keep broad reviewers on the full diff, scope file specialists to matching hunks, send a complete changed-file manifest and trusted preamble to every non-empty frame, and encode fence-tag text inside untrusted blocks
- docs prompt scoping includes rename and copy source paths for top-level docs, workflow, MCP, and environment example surfaces

Focused validation output:

```text
................................................
----------------------------------------------------------------------
Ran 48 tests in 0.027s

OK
```

Focused coverage output:

```text
Name                                        Stmts   Miss  Cover   Missing
-------------------------------------------------------------------------
scripts/benchmark-deep-review-pro.py          435      8    98%   268, 438, 594, 765-769
scripts/test_benchmark_deep_review_pro.py     517      0   100%
-------------------------------------------------------------------------
TOTAL                                         952      8    99%
```
