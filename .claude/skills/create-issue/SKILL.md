---
description: Draft and create a GitHub issue in the project's documented format.
---

Description: $ARGUMENTS

**Format — decide first: story or epic?**

See the Epic / Story convention and scales in the **Project board** section of [README.md](../../../README.md).

- **Story** — prefix like `[bug]`, `[ci]`, `[enhancement]`, etc. Use the five-section body below.
- **Epic** — prefix `[epic]`, apply `epic` label. Use the three-section body below (≥ 2 children).

**Story title:** `[label] Short imperative description`

**Story body (in order):**

1. **User Story** — "As a tester, I want ... so that ..."
2. **Context** — explanation of the current problem with exact file references
3. **Acceptance Criteria** — Given/When/Then scenarios covering the happy path and the failure case
4. **Implementation Hint** — concrete code snippet showing the fix
5. **Definition of Done** — checklist of observable, verifiable outcomes

**Epic title:** `[epic] Short imperative description`

**Epic body (in order, only these three sections):**

1. **Outcome** — 1–2 sentences describing what "done" looks like (or "looked like" for retrospective epics)
2. **Child stories** — bullet list of `#N — title` for every child
3. **Done when** — observable closure criterion (for retrospective epics, "already the case — this epic exists to organize history")

**Labels:** apply semantic labels such as `test-quality`, `flakiness`, `type-safety`, `pom`. For bug issues (title prefix `[bug]`), also apply one of `found-by-test`, `found-by-manual-testing`, or `found-in-production` to record how the bug was discovered. For epics, apply the `epic` label in addition to the topic labels.

**Milestone:** every issue must have a milestone. Pick the one that matches the nature of the work:

| Milestone | Use when the issue is about… |
|---|---|
| **Test Coverage Expansion** | New tests, new spec files, new page objects, new test patterns, visual regression |
| **CI Improvements** | GitHub Actions workflows — scheduling, triggers, parallelism, caching, Dependabot |
| **Test Infrastructure** | Fixtures, utilities, configuration, environment setup, documentation, refactoring |
| **Bug Fixes** | Bugs, flakiness fixes, security patches |
| **Developer Tooling** | Claude Code hooks, slash commands, settings, local dev setup (`act`, scripts) |
| **Quality Metrics Dashboard** | Defect escape rate, MTTR, coverage tracking, GitHub Pages dashboard |
| **Learning Exercises** | Self-study, technology exploration, proof-of-concept work |

If none of the existing milestones fit, **do not assign one silently** — propose a new milestone name and description to the user and wait for approval before creating it and assigning the issue.

**Project #1 board fields** (full scales in README **Project board** section):

- Stories get `Estimate` (Fibonacci 1/2/3/5/8). Anchor: `#145 = 3`.
- `Estimate = 13` triggers a warning — print `"13 is a warning zone; consider splitting or promoting to an epic. Proceed only if a split would be artificial."` and require explicit user confirmation before writing the field.
- `Estimate ≥ 21` is refused — propose creating an epic with child stories instead.
- Epics get `Size` (XS/S/M/L/XL). XS is reserved for a 2-story micro-epic.

**Project-level field IDs** (Project #1, owner `hubertgajewski`):

- Project ID: `PVT_kwHOAG7eT84BRbty`
- Size field: `PVTSSF_lAHOAG7eT84BRbtyzg_QzzA` (single-select; options XS `6c6483d2`, S `f784b110`, M `7515a9f1`, L `817d0097`, XL `db339eb2`)
- Estimate field: `PVTF_lAHOAG7eT84BRbtyzg_QzzE` (number)
- Start date field: `PVTF_lAHOAG7eT84BRbtyzg_QzzI`
- Target date field: `PVTF_lAHOAG7eT84BRbtyzg_QzzM`
- Actual hours field: `PVTF_lAHOAG7eT84BRbtyzhC91mc` (populated by `fix-issue`)

**Steps:**
1. Decide story vs epic based on `$ARGUMENTS`. Draft the title and all required body sections (five for a story, three for an epic). Ask for clarification on any ambiguous section before proceeding.
2. Select the appropriate milestone using the table above. If none fit, propose a new one and wait for approval.
3. For a story, pick an Estimate by analogy with the reference stories in the point scale table. If it feels like 13, surface the warning and ask the user whether a split is possible. If it feels like 21+, refuse and propose an epic instead. For an epic, pick a Size from the Size scale. Identify the parent epic if the story belongs to one.
4. Present the full draft (title, body, labels, milestone, Estimate or Size, optional parent) to the user for review.
5. After approval, run `gh issue create --title "<title>" --body "<body>" --label "<labels>" --milestone "<milestone>"` to create the issue. Capture the returned URL.
6. Add the new issue to Project #1:
   ```bash
   ITEM_ID=$(gh project item-add 1 --owner hubertgajewski --url "<url>" --format json | jq -r '.id')
   ```
7. Set the appropriate field:
   - Story: `gh project item-edit --project-id PVT_kwHOAG7eT84BRbty --id "$ITEM_ID" --field-id PVTF_lAHOAG7eT84BRbtyzg_QzzE --number <points>`
   - Epic: `gh project item-edit --project-id PVT_kwHOAG7eT84BRbty --id "$ITEM_ID" --field-id PVTSSF_lAHOAG7eT84BRbtyzg_QzzA --single-select-option-id <size-option-id>`
8. If the story has a parent epic, link it:
   ```bash
   CHILD_ID=$(gh api repos/hubertgajewski/orwellstat/issues/<new-issue-number> --jq .id)
   gh api --method POST repos/hubertgajewski/orwellstat/issues/<parent>/sub_issues -F sub_issue_id="$CHILD_ID"
   ```
9. Output the URL of the created issue plus a one-line summary of the project-board fields set.
