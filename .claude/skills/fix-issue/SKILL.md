---
description: Fix a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR.
---

Issue number: $ARGUMENTS

**Step 0 — Detect parent epic**
Before anything else, check whether the issue is a child of an epic:
```bash
PARENT=$(gh api repos/hubertgajewski/orwellstat/issues/$ARGUMENTS/parent --jq '.number // empty' 2>/dev/null || true)
```
If non-empty, print a banner: **"Parent epic: #$PARENT — do not close it. Closing child only."**

**Step 1 — Fetch the issue**
Run `gh issue view $ARGUMENTS` and read every section: User Story, Context, Acceptance Criteria, Implementation Hint, and Definition of Done. State what the issue requires before touching any code.

**Step 2 — Create the branch**
First, fetch the latest remote state so the branch is created from up-to-date main:
```bash
git fetch origin
```
Then check whether the target name already exists on the remote:
```bash
git ls-remote --heads origin feature/$ARGUMENTS   # or bugfix/$ARGUMENTS
```
If it exists, inspect its recent commits (`git log origin/<branch> --oneline -5`) to decide whether those changes relate to this issue or to something different. If they appear unrelated, pick an alternative name by appending a suffix (e.g. `feature/$ARGUMENTS-2`, `feature/$ARGUMENTS-3`) and repeat the check until a free name is found. Then create the branch from remote `main` using the chosen name (e.g. `git checkout -b feature/$ARGUMENTS origin/main`).

**Step 3 — Make the code change**
Implement the fix described in the issue. Follow all conventions in `CLAUDE.md` (POM, fixtures, path aliases, security, etc.).

**Step 4 — Security review (mandatory, do this first)**
Run `/security-review` (built-in Claude Code command). This must be done before the code review checklist — do not skip or defer it. If the command is unavailable, manually check: injection via untrusted input, path traversal in file I/O, unhandled parse errors, hardcoded secrets, overly broad permissions. Fix any findings before continuing.

**Step 4b — Code review checklist**
Work through `.claude/skills/deep-review/SKILL.md` in full. State a finding for each checklist item (pass, fail, or N/A with reason).

**Step 5 — Run the affected test(s)**
Run only the tests touched by the change. They must all pass before proceeding.

**Step 6 — Review the diff as a fresh reviewer**
Run `git diff` (staged + unstaged) and treat every changed file as unfamiliar code. Explicitly state a finding for each check below — "no issues" is not acceptable without articulating what was checked.

General checks (every diff):
- Every non-obvious change: "Would I understand why this was done just from the diff?" If no, add a code comment or adjust the implementation.
- No dead code, commented-out blocks, or debug artifacts left in.
- Docs updated: if a file documented in `README.md` changed, verify `README.md` reflects the change.

CI / workflow files (`.github/workflows/*.yml`):
- `timeout-minutes` set at the job level — no job should run unbounded.
- All `actions/*` pinned to a specific major version (e.g. `@v4`); third-party actions pinned to a full SHA.
- `node-version: lts/*` is acceptable for Node setup; npm package versions must be pinned in `package.json` + `package-lock.json` (use `npm ci`, not `npm install -g @package`).
- No env vars copied blindly from another workflow without verifying they apply.
- Secrets written to disk must be scoped to the minimum needed and never logged.
- Steps that only make sense in specific contexts must have an `if:` condition with a clear comment.
- Workflows that commit and push results back to the repository must have a `concurrency` group (`cancel-in-progress: false`) to prevent parallel runs racing on `git push`.
- When multiple steps or scripts produce the same value, verify they use the same format and precision — inconsistencies cause the step summary and committed files to disagree.

Scripts calling external APIs (e.g. `gh issue list`, REST calls):
- Guard against null/missing fields before using them — external APIs can return nulls even on fields that are usually present.
- Warn to stderr when a paginated call hits its item limit (e.g. `--limit 1000`) so silent data truncation is detectable.
- Verify the script is idempotent — re-running with the same input must not corrupt state (e.g. upsert by a natural key rather than blindly appending).
- Avoid duplicate API calls across steps: if two steps fetch the same data, consolidate them.

**Step 7 — Verify all acceptance criteria and the Definition of Done**
Read every Given/When/Then scenario and every DoD checkbox in the issue. For each item, explicitly confirm it is satisfied or identify what is missing. Do not proceed to commit until all criteria pass.

**Step 8 — Commit**
Stage changed files by name (never `git add -A`). Follow the **Commit message convention** in `CLAUDE.md`: prefix with `#` and the issue number, single line, no body, no `Co-Authored-By` trailer.

**Step 9 — Push and create a PR**
Push the branch and run `gh pr create`. The PR body must include:
- `Closes #$ARGUMENTS` so GitHub links and auto-closes the issue on merge
- If `$PARENT` was detected in Step 0: also add a line `Contributes to #$PARENT` (not `Closes` — the epic stays open until all children are done)
- A **Test plan** section with a checklist of observable, verifiable steps. Mark steps already verified during development as `[x]`. Steps that require a reviewer or CI to verify must be left as `[ ]`.

**Step 10 — Verify the PR test plan**
Re-read every test plan item. For each `[ ]` item that can be verified now, execute and confirm it, then update the PR body via `gh pr edit` to mark it `[x]`. For items that genuinely require a reviewer or CI, leave them as `[ ]` and note what is needed. If any item is found failing, implement a fix on the same branch: work through the code review checklist, run the affected tests, commit and push before considering the task done.

**Step 11 — After merge: record Actual hours on the project item**
See **Project board → Actual hours** in [README.md](../../../README.md) for how to derive the value.

```bash
PROJECT_ID=PVT_kwHOAG7eT84BRbty
HOURS_FIELD_ID=PVTF_lAHOAG7eT84BRbtyzhC91mc
ITEM_ID=$(gh project item-list 1 --owner hubertgajewski --format json --limit 200 \
  | jq -r ".items[] | select(.content.number == $ARGUMENTS) | .id")
gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" \
  --field-id "$HOURS_FIELD_ID" --number <hours>
```
