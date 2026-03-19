---
description: Review staged and unstaged changes against the project's code review checklist.
---

Review staged and unstaged changes against the project's code review checklist.

Run `git diff HEAD` to see all changes, then work through every item in the **Code review checklist** section of `CLAUDE.md`. For each item, explicitly state a finding: **pass**, **fail** (with the specific problem), or **N/A** (with the reason it does not apply). Saying "no issues" without articulating what was checked is not acceptable.

Also apply the general diff checks from the **Issue fix workflow** section of `CLAUDE.md`:
- Every non-obvious change: "Would I understand why this was done just from the diff?" If no, flag it.
- No credentials, tokens, or secrets in committed files.
- No dead code, commented-out blocks, or debug artifacts left in.
- Docs updated: if a file documented in `README.md` changed, verify `README.md` reflects the change.

If `.github/workflows/*.yml` files changed, apply the CI workflow checks from the **Issue fix workflow** section of `CLAUDE.md`.

After completing all checks, provide a summary: total pass / fail / N/A counts and a prioritised list of any failures that must be fixed before committing.
