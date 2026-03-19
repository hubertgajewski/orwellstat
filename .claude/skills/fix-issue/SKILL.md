---
description: Fix a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR.
---

Issue number: $ARGUMENTS

**Step 1 — Fetch the issue**
Run `gh issue view $ARGUMENTS` and read every section: User Story, Context, Acceptance Criteria, Implementation Hint, and Definition of Done. State what the issue requires before touching any code.

**Step 2 — Create the branch**
Create a branch from remote `main` named `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS` as appropriate (e.g. `git checkout -b feature/$ARGUMENTS origin/main`).

**Step 3 — Make the code change**
Implement the fix described in the issue. Follow all conventions in `CLAUDE.md` (POM, fixtures, path aliases, security, etc.).

**Step 4 — Review against the code review checklist**
Work through every item in the **Code review checklist** section of `CLAUDE.md` and explicitly state a finding for each (pass, fail, or N/A with reason).

**Step 5 — Run the affected test(s)**
Run only the tests touched by the change. They must all pass before proceeding.

**Step 6 — Review the diff as a fresh reviewer**
Run `git diff` (staged + unstaged) and treat every changed file as unfamiliar code. Explicitly state a finding for each check below — "no issues" is not acceptable without articulating what was checked.

General checks (every diff):
- Every non-obvious change: "Would I understand why this was done just from the diff?" If no, add a code comment or adjust the implementation.
- No credentials, tokens, or secrets in committed files.
- No dead code, commented-out blocks, or debug artifacts left in.
- Docs updated: if a file documented in `README.md` changed, verify `README.md` reflects the change.

CI / workflow files (`.github/workflows/*.yml`):
- `timeout-minutes` set at the job level — no job should run unbounded.
- All `actions/*` pinned to a specific major version (e.g. `@v4`); third-party actions pinned to a full SHA.
- `node-version: lts/*` is acceptable for Node setup; npm package versions must be pinned in `package.json` + `package-lock.json` (use `npm ci`, not `npm install -g @package`).
- No env vars copied blindly from another workflow without verifying they apply.
- Secrets written to disk must be scoped to the minimum needed and never logged.
- Steps that only make sense in specific contexts must have an `if:` condition with a clear comment.

**Step 7 — Verify all acceptance criteria and the Definition of Done**
Read every Given/When/Then scenario and every DoD checkbox in the issue. For each item, explicitly confirm it is satisfied or identify what is missing. Do not proceed to commit until all criteria pass.

**Step 8 — Commit**
Stage changed files by name (never `git add -A`). Follow the **Commit message convention** in `CLAUDE.md`: prefix with the issue number, single line, no body, no `Co-Authored-By` trailer.

**Step 9 — Push and create a PR**
Push the branch and run `gh pr create`. The PR body must include:
- `Closes #$ARGUMENTS` so GitHub links and auto-closes the issue on merge
- A **Test plan** section with a checklist of observable, verifiable steps. Mark steps already verified during development as `[x]`. Steps that require a reviewer or CI to verify must be left as `[ ]`.

**Step 10 — Verify the PR test plan**
Re-read every test plan item. For each `[ ]` item that can be verified now, execute and confirm it, then update the PR body via `gh pr edit` to mark it `[x]`. For items that genuinely require a reviewer or CI, leave them as `[ ]` and note what is needed. If any item is found failing, implement a fix on the same branch: work through the code review checklist, run the affected tests, commit and push before considering the task done.
