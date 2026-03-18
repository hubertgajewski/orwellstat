Draft and create a GitHub issue in the project's documented format.

Description: $ARGUMENTS

Scaffold the issue in the exact format from CLAUDE.md, then create it via `gh issue create`.

**Required format:**

**Title:** `[label] Short imperative description`

**Body sections (in order):**

1. **User Story** — "As a tester, I want ... so that ..."
2. **Context** — explanation of the current problem with exact file references
3. **Acceptance Criteria** — Given/When/Then scenarios covering the happy path and the failure case
4. **Implementation Hint** — concrete code snippet showing the fix
5. **Definition of Done** — checklist of observable, verifiable outcomes

**Labels:** apply semantic labels such as `test-quality`, `flakiness`, `type-safety`, `pom`.

**Steps:**
1. Draft the title and all five body sections based on `$ARGUMENTS`. Ask for clarification on any section where the input is ambiguous before proceeding.
2. Present the full draft to the user for review.
3. After approval, run `gh issue create --title "<title>" --body "<body>" --label "<labels>"` to create the issue.
4. Output the URL of the created issue.
