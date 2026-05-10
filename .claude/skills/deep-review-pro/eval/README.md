# deep-review-pro Recall Benchmark

This benchmark tracks whether `/deep-review-pro` recalls Sonnet's historical blocking review findings before the final rename work in #435.

## Stable Review Window

Window: 2026-04-10 08:06 UTC through 2026-04-14 10:54 UTC, ending before PR #218 merged at 2026-04-14 13:33 UTC.

Why this window:

- It is less than four calendar days, well within the <= 4-week requirement.
- It is before #218, the provider-switching change called out in #434.
- Sonnet review behavior is consistent across the selected PRs: `CHANGES_REQUESTED` reviews mark blocking findings, `APPROVED` reviews use explicit advisory language for nits and follow-ups, and later reviews confirm whether findings were fixed, accepted, or out of scope.
- PR #205 is included to exercise the CI semantic-review rule that a workflow-run `head_sha` may not be present after checking out the default branch.

## Corpus

| PR   | Size                           | Primary domain                  | Why selected                                                                           |
| ---- | ------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------- |
| #195 | Medium, 3 files, +179/-7       | Docs + review tooling           | Skill-file and README changes with advisory-only inline comments.                      |
| #197 | Medium, 2 files, +171/-26      | Playwright TypeScript utilities | Selector-fix logic with three blocking correctness/validation findings.                |
| #201 | Large, 6 files, +1544/-1       | CI + Python scripts + tests     | Self-healing workflow, GitHub API calls, and script behavior.                          |
| #205 | Small, 1 file, +5/-2           | CI workflow                     | Required regression for `head_sha` object availability.                                |
| #213 | Medium-small, 6 files, +31/-17 | Model config + docs + CI        | Stable approved review with a non-blocking follow-up for self-healing model overrides. |

The corpus intentionally spans small, medium, and large diffs across Playwright, CI, scripts, docs, and tooling.

## Classification Rules

Source data comes from:

- `GET /repos/hubertgajewski/orwellstat/pulls/<N>/reviews`
- `GET /repos/hubertgajewski/orwellstat/pulls/<N>/comments`
- `GET /repos/hubertgajewski/orwellstat/issues/<N>/comments`

Only reviewer entries from `claude` / `claude[bot]` are included.

Findings are classified as:

- Blocking: any finding in a `CHANGES_REQUESTED` review, or any explicitly must-fix / critical finding in the review summary or inline comments for that review round.
- Advisory: findings labelled as nit, minor, recommended, follow-up, out of scope, or not a blocker.
- Explicitly excluded: blocking findings later fixed before merge, or findings later withdrawn/accepted by Sonnet based on new evidence.

Every finding records:

- Stable finding ID (`B<n>`, `A<n>`, or `E<n>`).
- Source PR, file, and line/region where available.
- `commit_id` reviewed by Sonnet.
- Expected `deep-review-pro` agent.
- Category used for recall matching.

## Recall Scoring

Blocking recall is hard-gated:

```text
blocking_recall = matched_non_excluded_blocking / non_excluded_blocking
```

The benchmark passes only when blocking recall is 100%. If the denominator is zero for a corpus revision because all historical blockers were fixed before merge or explicitly withdrawn by Sonnet, the result is recorded as `100% (0/0 active blockers; exclusions audited)` rather than as a numeric evidence gain.

Advisory recall is soft-tracked:

```text
advisory_recall = matched_advisory / advisory_total
```

The target is >= 80% per skill version. Advisory misses are logged for agent tuning but do not fail #434.

## Matching Rule

A `deep-review-pro` finding matches a Sonnet finding when:

- It names the same file and a region within +/-5 lines when a line is available, or the same file-level region when the historical comment has no line.
- It reports the same defect category, even if the prose is different.
- It is emitted by the expected agent, or by a narrower specialist agent that owns the same category in the current roster.

## Running the Benchmark

For each corpus PR:

```bash
/deep-review-pro <PR#>
```

Save the aggregate report under `eval/results/pr-<PR>-<skill-version>.md`.

Codex limitation: Codex cannot literally invoke Claude Code slash commands or the Claude `Task` tool. In Codex runs, use the closest available workflow: read `.claude/skills/deep-review-pro/SKILL.md`, apply the same roster and matching rules manually or with Codex sub-agents only when sub-agents are explicitly authorized, and label the result as a Codex substitution.

## Adding a PR

1. Confirm the PR merged before #218 or intentionally start a new stable-config window and document it here.
2. Fetch reviews, inline review comments, and issue comments from the three endpoints above.
3. Filter to `claude` / `claude[bot]`.
4. Add `eval/corpus/pr-<PR>.md` with blocking, advisory, and explicitly excluded buckets.
5. Record `commit_id`, expected agent, category, source URL, and file region for every finding.
6. Run `/deep-review-pro <PR#>` and add `eval/results/pr-<PR>-<skill-version>.md`.
7. Update the summary table and recall totals if the benchmark set changes.
