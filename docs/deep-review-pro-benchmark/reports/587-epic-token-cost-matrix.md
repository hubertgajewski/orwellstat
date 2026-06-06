# Issue 587 Deep-Review-Pro Token-Cost Matrix

This report is the comparable benchmark surface for the #587 epic. It uses one fixture set and one set of units for every child story.

Exact runtime token usage is unavailable in this Codex run, so token fields below are deterministic proxy estimates, not billing data.

## Measurement Contract

- `original-580` is the baseline after #579 and before #580.
- Every checkpoint uses the same current fixture set.
- Historical prompt text, roster dispatch cells, prompt scopes, and agent prompt files are read from the checkpoint commit with `git show`.
- The active `WORKTREE` checkpoint reads current prompt files directly before the branch is committed.
- Prompt tokens and aggregate-output tokens are estimated as `ceil(characters / 4)` per fixture and summed for totals.
- Every child story is reported with an incremental delta and a cumulative delta against `original-580`.

## Checkpoints

| Checkpoint | Ref | Prompt chars | Prompt est. tokens | Aggregate-output chars | Aggregate-output est. tokens | Combined chars | Combined est. tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| original-580 | 4398fc9 | 3,789,160 | 947,294 | 33,033 | 8,261 | 3,822,193 | 955,555 |
| post-580 | f57b577 | 3,736,035 | 934,011 | 31,323 | 7,834 | 3,767,358 | 941,845 |
| post-581 | 5e6947f | 2,021,135 | 505,287 | 31,323 | 7,834 | 2,052,458 | 513,121 |
| post-582 | f1013ec | 2,021,135 | 505,287 | 32,293 | 8,077 | 2,053,428 | 513,364 |
| post-583 | f3952ee | 2,026,319 | 506,583 | 11,561 | 2,894 | 2,037,880 | 509,477 |
| post-584 | 0d7add0 | 1,964,147 | 491,040 | 11,561 | 2,894 | 1,975,708 | 493,934 |
| post-585 | 825069c | 1,946,824 | 486,708 | 14,886 | 3,725 | 1,961,710 | 490,433 |

## Checkpoint Contracts

| Checkpoint | Dispatch contract | Prompt-frame contract | Aggregate-output contract |
| --- | --- | --- | --- |
| original-580 | dispatch-v1 | full-v1 | detailed-v1 |
| post-580 | dispatch-v1 | full-v1 | detailed-v1 |
| post-581 | dispatch-v1 | scoped-v1 | detailed-v1 |
| post-582 | dispatch-v1 | scoped-v1 | detailed-reuse-v1 |
| post-583 | dispatch-v1 | scoped-v1 | compact-v1 |
| post-584 | dispatch-v1 | scoped-v1 | compact-v1 |
| post-585 | dispatch-static-v1 | scoped-v1 | compact-static-v1 |

## Incremental Deltas

| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| #580 | original-580 | post-580 | 3,822,193 | 3,767,358 | -54,835 (-1.43%) | 955,555 | 941,845 | -13,710 (-1.43%) |
| #581 | post-580 | post-581 | 3,767,358 | 2,052,458 | -1,714,900 (-45.52%) | 941,845 | 513,121 | -428,724 (-45.52%) |
| #582 | post-581 | post-582 | 2,052,458 | 2,053,428 | 970 (0.05%) | 513,121 | 513,364 | 243 (0.05%) |
| #583 | post-582 | post-583 | 2,053,428 | 2,037,880 | -15,548 (-0.76%) | 513,364 | 509,477 | -3,887 (-0.76%) |
| #584 | post-583 | post-584 | 2,037,880 | 1,975,708 | -62,172 (-3.05%) | 509,477 | 493,934 | -15,543 (-3.05%) |
| #585 | post-584 | post-585 | 1,975,708 | 1,961,710 | -13,998 (-0.71%) | 493,934 | 490,433 | -3,501 (-0.71%) |

## Cumulative Deltas vs Original #580 Baseline

| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| #580 | original-580 | post-580 | 3,822,193 | 3,767,358 | -54,835 (-1.43%) | 955,555 | 941,845 | -13,710 (-1.43%) |
| #581 | original-580 | post-581 | 3,822,193 | 2,052,458 | -1,769,735 (-46.30%) | 955,555 | 513,121 | -442,434 (-46.30%) |
| #582 | original-580 | post-582 | 3,822,193 | 2,053,428 | -1,768,765 (-46.28%) | 955,555 | 513,364 | -442,191 (-46.28%) |
| #583 | original-580 | post-583 | 3,822,193 | 2,037,880 | -1,784,313 (-46.68%) | 955,555 | 509,477 | -446,078 (-46.68%) |
| #584 | original-580 | post-584 | 3,822,193 | 1,975,708 | -1,846,485 (-48.31%) | 955,555 | 493,934 | -461,621 (-48.31%) |
| #585 | original-580 | post-585 | 3,822,193 | 1,961,710 | -1,860,483 (-48.68%) | 955,555 | 490,433 | -465,122 (-48.68%) |

## Fixture Set

- `docs-only`
- `playwright-test`
- `workflow`
- `mixed-typescript`
- `script-code-only`
- `large-diff`
- `high-lines`
