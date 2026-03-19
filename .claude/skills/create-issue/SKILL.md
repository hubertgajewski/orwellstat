---
description: Draft and create a GitHub issue in the project's documented format.
---

Draft and create a GitHub issue in the project's documented format.

Description: $ARGUMENTS

Scaffold the issue following the **GitHub issue format** section in `CLAUDE.md` (title, body sections, labels, milestone), then create it via `gh issue create`.

**Steps:**
1. Draft the title and all five body sections based on `$ARGUMENTS`. Ask for clarification on any ambiguous section before proceeding.
2. Select the appropriate milestone using the milestone table in `CLAUDE.md`. If none fit, propose a new one and wait for approval.
3. Present the full draft (title, body, labels, milestone) to the user for review.
4. After approval, run `gh issue create --title "<title>" --body "<body>" --label "<labels>" --milestone "<milestone>"` to create the issue.
5. Output the URL of the created issue.
