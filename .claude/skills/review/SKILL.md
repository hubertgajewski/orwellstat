---
description: Review staged and unstaged changes against the project's code review checklist.
---

Run `git diff HEAD` to see all changes, then work through every item in the **Code review checklist** section of `CLAUDE.md`. For each item, explicitly state a finding: **pass**, **fail** (with the specific problem), or **N/A** (with the reason it does not apply). Saying "no issues" without articulating what was checked is not acceptable.

Also apply the general diff checks and (if `.github/workflows/*.yml` files changed) the CI workflow checks from the **"Review the diff as a fresh reviewer"** step in `.claude/skills/fix-issue/SKILL.md`.

After completing all checks, provide a summary: total pass / fail / N/A counts and a prioritised list of any failures that must be fixed before committing.
