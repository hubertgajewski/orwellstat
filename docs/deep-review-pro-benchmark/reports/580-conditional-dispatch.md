# Issue 580 Conditional Dispatch Benchmark

This report records the `/deep-review-pro` benchmark evidence for issue #580, which changes the low-risk agents `deep-review-security`, `deep-review-project-checklist`, and `deep-review-docs` from unconditional dispatch to deterministic trigger-based dispatch.

## Harness

- Fixture source: `docs/deep-review-pro-benchmark/fixtures.json`
- Benchmark command:

  ```bash
  tmp=$(mktemp -d /tmp/orwellstat-benchmark-580.XXXXXX)
  mkdir -p "$tmp/before" "$tmp/after"
  python3 scripts/benchmark-deep-review-pro.py \
    --before "$tmp/before" \
    --after "$tmp/after" \
    --out-dir "$tmp/report"
  ```

- Validation command:

  ```bash
  python3 -m coverage run -m unittest scripts.test_benchmark_deep_review_pro
  python3 -m coverage report -m scripts/benchmark-deep-review-pro.py scripts/test_benchmark_deep_review_pro.py
  ```

## Token Availability

Codex sub-agent runs were explicitly authorized for this issue, but the `multi_agent_v1` harness does not expose the Claude-style `<usage>` postscript consumed by `scripts/benchmark-deep-review-pro.py`. A probe sub-agent returned `usage metadata: not exposed by harness`.

Because the measurement story requires missing usage data to be reported explicitly instead of treated as zero, token, tool-use, wall-clock, cache-read, and cache-creation fields are recorded as unavailable for this Codex-run benchmark. Dispatch and skip counts are exact from the fixture metadata.

## Before/After Dispatch Comparison

The `before` column reflects the pre-#580 roster where `deep-review-security`, `deep-review-project-checklist`, and `deep-review-docs` were `always`. The `after` column reflects the trigger-based roster in `.claude/skills/deep-review-pro/SKILL.md`.

| Fixture | Dispatched Before | Dispatched After | Delta | Skipped Before | Skipped After | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 6 | 4 | -2 | 5 | 7 | +2 |
| `playwright-test` | 8 | 6 | -2 | 3 | 5 | +2 |
| `workflow` | 7 | 7 | 0 | 4 | 4 | 0 |
| `mixed-typescript` | 8 | 8 | 0 | 3 | 3 | 0 |
| `script-code-only` | 8 | 6 | -2 | 3 | 5 | +2 |
| `large-diff` | 11 | 11 | 0 | 0 | 0 | 0 |
| `high-lines` | 11 | 11 | 0 | 0 | 0 | 0 |
| **Total** | **59** | **53** | **-6** | **18** | **24** | **+6** |

## Prompt-Footprint Estimate

Exact runtime token usage is unavailable in Codex, but the branch can still estimate prompt-input footprint from repository text. This estimate sums, for each dispatched agent, the current agent prompt file, the roster domain string passed as the task description, and the benchmark fixture diff wrapped in the prompt frame. It then uses `ceil(characters / 4)` as a heuristic token estimate.

This follows the benchmark README's Cost Proxy Policy. It is not billing data. It excludes harness overhead, cache effects, conversation history, model-specific tokenization, and agent output tokens. It is useful only as a deterministic before/after proxy for the prompt text this change stops sending.

| Fixture | Agents Before | Agents After | Prompt Chars Before | Prompt Chars After | Est. Tokens Before | Est. Tokens After | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `docs-only` | 6 | 4 | 60,238 | 38,054 | 15,060 | 9,514 | -5,546 |
| `playwright-test` | 8 | 6 | 83,960 | 61,490 | 20,990 | 15,373 | -5,617 |
| `workflow` | 7 | 7 | 74,296 | 74,296 | 18,574 | 18,574 | 0 |
| `mixed-typescript` | 8 | 8 | 86,385 | 86,385 | 21,597 | 21,597 | 0 |
| `script-code-only` | 8 | 6 | 85,468 | 69,412 | 21,367 | 17,353 | -4,014 |
| `large-diff` | 11 | 11 | 129,944 | 129,944 | 32,486 | 32,486 | 0 |
| `high-lines` | 11 | 11 | 3,277,726 | 3,277,726 | 819,432 | 819,432 | 0 |
| **Total** | **59** | **53** | **3,798,017** | **3,737,307** | **949,506** | **934,329** | **-15,177** |

Interpretation:

- affected low-risk fixtures (`docs-only`, `playwright-test`, `script-code-only`): estimated prompt-input proxy drops from 57,417 to 42,240 tokens, a 26.43% reduction
- representative set excluding the high-lines stress fixture: estimated prompt-input proxy drops from 130,074 to 114,897 tokens, an 11.67% reduction
- full fixture set including high-lines: estimated prompt-input proxy drops from 949,506 to 934,329 tokens, a 1.60% reduction

## Fixture Validation

`scripts/test_benchmark_deep_review_pro.py` verifies:

- the three low-risk rows in `.claude/skills/deep-review-pro/SKILL.md` no longer use `always`
- `docs-only` dispatches docs but skips security and project-checklist
- `playwright-test` dispatches project-checklist, TypeScript, and QA but skips docs and security
- `script-code-only` dispatches security, Python, and unit-test but skips project-checklist and docs

Focused coverage output:

```text
Name                                        Stmts   Miss  Cover   Missing
-------------------------------------------------------------------------
scripts/benchmark-deep-review-pro.py          262      7    97%   96, 252, 423-427
scripts/test_benchmark_deep_review_pro.py     347      1    99%   900
-------------------------------------------------------------------------
TOTAL                                         609      8    99%
```
