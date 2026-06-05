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
