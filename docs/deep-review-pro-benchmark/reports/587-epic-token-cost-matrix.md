# Issue 587 Deep-Review-Pro Token-Cost Matrix

This report is the comparable benchmark surface for the #587 epic. It uses one fixture set and one set of units for every child story.

Exact runtime token usage is unavailable in this Codex run, so token fields below are deterministic proxy estimates, not billing data.

## Measurement Contract

- `original-580` is the baseline after #579 and before #580.
- Every checkpoint uses the same current fixture set.
- Historical prompt text, roster dispatch cells, prompt scopes, and agent prompt files are read from the checkpoint commit with `git show`.
- Prompt tokens and aggregate-output tokens are estimated as `ceil(characters / 4)` per fixture and summed for totals.
- Every child story is reported with an incremental delta and a cumulative delta against `original-580`.

## Checkpoints

| Checkpoint | Ref | Prompt chars | Prompt est. tokens | Aggregate-output chars | Aggregate-output est. tokens | Combined chars | Combined est. tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| original-580 | 4398fc9 | 3,789,160 | 947,294 | 13,107 | 3,279 | 3,802,267 | 950,573 |
| post-580 | f57b577 | 3,736,035 | 934,011 | 12,379 | 3,097 | 3,748,414 | 937,108 |
| post-581 | 5e6947f | 2,021,135 | 505,287 | 12,379 | 3,097 | 2,033,514 | 508,384 |
| post-582 | f1013ec | 2,021,135 | 505,287 | 12,379 | 3,097 | 2,033,514 | 508,384 |
| post-583 | HEAD | 2,026,319 | 506,583 | 2,246 | 564 | 2,028,565 | 507,147 |

## Incremental Deltas

| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| #580 | original-580 | post-580 | 3,802,267 | 3,748,414 | -53,853 (-1.42%) | 950,573 | 937,108 | -13,465 (-1.42%) |
| #581 | post-580 | post-581 | 3,748,414 | 2,033,514 | -1,714,900 (-45.75%) | 937,108 | 508,384 | -428,724 (-45.75%) |
| #582 | post-581 | post-582 | 2,033,514 | 2,033,514 | 0 (0.00%) | 508,384 | 508,384 | 0 (0.00%) |
| #583 | post-582 | post-583 | 2,033,514 | 2,028,565 | -4,949 (-0.24%) | 508,384 | 507,147 | -1,237 (-0.24%) |

## Cumulative Deltas vs Original #580 Baseline

| Issue | From | To | Combined chars before | Combined chars after | Char delta | Combined est. tokens before | Combined est. tokens after | Token delta |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| #580 | original-580 | post-580 | 3,802,267 | 3,748,414 | -53,853 (-1.42%) | 950,573 | 937,108 | -13,465 (-1.42%) |
| #581 | original-580 | post-581 | 3,802,267 | 2,033,514 | -1,768,753 (-46.52%) | 950,573 | 508,384 | -442,189 (-46.52%) |
| #582 | original-580 | post-582 | 3,802,267 | 2,033,514 | -1,768,753 (-46.52%) | 950,573 | 508,384 | -442,189 (-46.52%) |
| #583 | original-580 | post-583 | 3,802,267 | 2,028,565 | -1,773,702 (-46.65%) | 950,573 | 507,147 | -443,426 (-46.65%) |

## Fixture Set

- `docs-only`
- `playwright-test`
- `workflow`
- `mixed-typescript`
- `script-code-only`
- `large-diff`
- `high-lines`
