# Issue 581 Agent-Specific Subdiff Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #581, which changes dispatched specialist agents from a shared full-diff prompt frame to per-agent prompt frames. Broad reviewers keep the full diff; file specialists receive matching hunks plus a complete `<changed-files>` manifest.

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
| `docs-only` | 4 | 39,179 | 39,439 | 9,795 | 9,860 | 65 |
| `playwright-test` | 6 | 63,224 | 63,728 | 15,806 | 15,932 | 126 |
| `workflow` | 7 | 76,281 | 76,841 | 19,071 | 19,211 | 140 |
| `mixed-typescript` | 8 | 88,698 | 89,137 | 22,175 | 22,285 | 110 |
| `script-code-only` | 6 | 71,116 | 71,518 | 17,779 | 17,880 | 101 |
| `large-diff` | 11 | 133,153 | 130,997 | 33,289 | 32,750 | -539 |
| `high-lines` | 11 | 3,280,935 | 1,565,832 | 820,234 | 391,458 | -428,776 |
| **Total** | **53** | **3,752,586** | **2,037,492** | **938,147** | **509,373** | **-428,774** |

Interpretation:

- high-line stress fixture: estimated prompt-input proxy drops from 820,234 to 391,458 tokens, a 52.27% reduction
- representative set excluding `high-lines`: estimated prompt-input proxy is effectively flat, 117,913 to 117,915 tokens, because the manifest overhead offsets savings on tiny fixture hunks
- full fixture set including `high-lines`: estimated prompt-input proxy drops from 938,147 to 509,373 tokens, a 45.70% reduction

## Fixture Validation

`scripts/test_benchmark_deep_review_pro.py` verifies:

- `.claude/skills/deep-review-pro/SKILL.md` documents `CHANGED_FILES`, `<changed-files>`, and `PROMPT_FRAME_<Agent>`
- broad agents (`security`, `simplification`, `code`, and `architecture`) are explicitly documented as full-diff recipients
- scoped specialists (`project-checklist`, `docs`, `typescript`, `python`, `ci`, `qa`, and `unit-test`) are explicitly documented as relevant-hunk recipients
- every specialist prompt documents the complete changed-file manifest and the fact that the inline diff can omit unrelated hunks

Focused validation output:

```text
.......................................
----------------------------------------------------------------------
Ran 39 tests in 0.035s

OK
```

Focused coverage output:

```text
Name                                        Stmts   Miss  Cover   Missing
-------------------------------------------------------------------------
scripts/benchmark-deep-review-pro.py          262      7    97%   96, 252, 423-427
scripts/test_benchmark_deep_review_pro.py     402      1    99%   1007
-------------------------------------------------------------------------
TOTAL                                         664      8    99%
```
