---
description: Fix a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR.
---

Fix a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR.

Issue number: $ARGUMENTS

**Step 1 — Fetch the issue**
Run `gh issue view $ARGUMENTS` and read every section: User Story, Context, Acceptance Criteria, Implementation Hint, and Definition of Done. State what the issue requires before touching any code.

**Step 2 — Make the code change**
Implement the fix described in the issue. Follow all conventions in CLAUDE.md (POM, fixtures, path aliases, security, etc.).

**Step 3 — Review against the code review checklist**
Work through every item in the **Code review checklist** section of `CLAUDE.md` and explicitly state a finding for each (pass, fail, or N/A with reason).

**Step 4 — Run the affected test(s)**
Run only the tests touched by the change. They must all pass before proceeding.

**Step 5 — Create the branch**
Create a branch from remote `main` named `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS` as appropriate (e.g. `git checkout -b feature/$ARGUMENTS origin/main`).

**Step 6 — Review the diff as a fresh reviewer**
Run `git diff` (staged + unstaged) and treat every changed file as unfamiliar code. Follow the diff review checks in the **Issue fix workflow** section of `CLAUDE.md`. Explicitly state a finding for each check — "no issues" is not acceptable without articulating what was checked.

**Step 7 — Verify all acceptance criteria and the Definition of Done**
Read every Given/When/Then scenario and every DoD checkbox in the issue. For each item, explicitly confirm it is satisfied or identify what is missing. Do not proceed to commit until all criteria pass.

**Step 8 — Commit**
Stage changed files by name (never `git add -A`). Follow the **Commit message convention** in `CLAUDE.md`: prefix with the issue number, single line, no body, no `Co-Authored-By` trailer.

**Step 9 — Push and create a PR**
Push the branch and run `gh pr create` with `Closes #$ARGUMENTS` in the PR body so GitHub links and auto-closes the issue on merge.
