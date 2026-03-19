---
description: Draft and create a GitHub issue in the project's documented format.
---

Draft and create a GitHub issue in the project's documented format.

Description: $ARGUMENTS

**Format**

**Title:** `[label] Short imperative description`

**Body sections (in order):**

1. **User Story** — "As a tester, I want ... so that ..."
2. **Context** — explanation of the current problem with exact file references
3. **Acceptance Criteria** — Given/When/Then scenarios covering the happy path and the failure case
4. **Implementation Hint** — concrete code snippet showing the fix
5. **Definition of Done** — checklist of observable, verifiable outcomes

**Labels:** apply semantic labels such as `test-quality`, `flakiness`, `type-safety`, `pom`.

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

**Steps:**
1. Draft the title and all five body sections based on `$ARGUMENTS`. Ask for clarification on any ambiguous section before proceeding.
2. Select the appropriate milestone using the table above. If none fit, propose a new one and wait for approval.
3. Present the full draft (title, body, labels, milestone) to the user for review.
4. After approval, run `gh issue create --title "<title>" --body "<body>" --label "<labels>" --milestone "<milestone>"` to create the issue.
5. Output the URL of the created issue.
