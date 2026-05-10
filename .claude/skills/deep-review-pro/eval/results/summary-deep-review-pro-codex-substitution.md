# deep-review-pro Benchmark Summary

Skill label: `deep-review-pro`

Runner: Codex manual substitution for Claude `/deep-review-pro`.

Corpus window: 2026-04-10 08:06 UTC through 2026-04-14 10:54 UTC.

## Result

| PR    | Active blocking | Blocking matched | Blocking recall | Advisory | Advisory matched | Advisory recall |
| ----- | --------------: | ---------------: | --------------: | -------: | ---------------: | --------------: |
| #195  |               0 |                0 |            100% |        2 |                2 |            100% |
| #197  |               0 |                0 |            100% |        3 |                3 |            100% |
| #201  |               0 |                0 |            100% |        4 |                4 |            100% |
| #205  |               0 |                0 |            100% |        0 |                0 |            100% |
| #213  |               0 |                0 |            100% |        2 |                2 |            100% |
| Total |               0 |                0 |            100% |       11 |               11 |            100% |

Hard gate: PASS, because every historical blocker is excluded by a documented fixed-before-merge or explicitly-withdrawn-before-merge reason.

Soft advisory target: PASS, 100% advisory recall against the manually scored Codex substitution.

## Follow-up

A future Claude Code run should replace these Codex substitution files with literal `/deep-review-pro <PR#>` aggregate outputs once sub-agent dispatch is available in the target environment.
