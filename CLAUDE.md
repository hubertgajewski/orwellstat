# CLAUDE.md

This file provides behavioral instructions to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep `README.md` up to date.** Whenever the project structure changes — new directories, renamed files, new sub-projects, changed commands, updated CI, modified environment variables — update `README.md` before finishing the task. `CLAUDE.md` documents behavioral instructions only; update it only when adding, changing, or removing behavioral guidance for Claude — such as the code review checklist, issue format, issue fix workflow, or any other conventions Claude should follow.

> **Keep skill files in sync.** The files in `.claude/skills/` reference sections of this file by name. Whenever the **Code review checklist**, **GitHub issue format**, or **Issue fix workflow** sections are renamed or removed, update the corresponding skill file (`fix-issue/SKILL.md`, `create-issue/SKILL.md`, `review/SKILL.md`) to match before finishing the task.

For repository structure, environment variable definitions, `playwright/typescript` architecture (directory layout, POM conventions, path aliases, Playwright config, CI workflows), and Bruno documentation, see [README.md](README.md). That file is the single source of truth for all reference material.

---

## Code review checklist

Before committing changes to `playwright/typescript`, review against these criteria:

- **Playwright test correctness** — selectors use `getByRole()` / `getByText()` with `exact: true`; no CSS class selectors; no `waitForTimeout()`; count asserted before `.nth()`; no `.first()` silencing missing elements; assertions are specific and meaningful (not just `toBeTruthy()`)
- **Fixture usage** — custom fixtures from `base.fixture.ts` used where appropriate; tests using `authenticatedRequest` or `unauthenticatedRequest` import from `@fixtures/api.fixture` (not `@fixtures/base.fixture`); no manual login logic duplicated outside `auth.setup.ts`; imports never come directly from `@playwright/test`
- **Page Object Model conventions** — page classes extend `AbstractPage`; `heading` getter uses `getByRole('heading', { name: ..., exact: true })`; static `url`, `title`, `accessKey` defined; no page-specific logic leaking into test files
- **TypeScript quality** — no `!` non-null assertions on env vars; `page.evaluate()` calls have explicit generic type; no implicit `any`; no unused imports; path aliases used instead of relative imports (`@fixtures/*`, `@pages/*`, `@utils/*`, `@test-data/*`, `@types-local/*`); `tsc --noEmit` passes
- **Potential bugs** — async/await not missing on Playwright calls; no unhandled promise rejections; locators not reused across navigations; any file reading `process.env` credentials calls `loadEnv(import.meta.url, N)` at module top level (missing this passes on CI but fails locally)
- **Flakiness** — no fixed timeouts; animation waits use `requestAnimationFrame`; auth setup asserts login actually succeeded; no assumptions about element order without explicit count assertion
- **Security** — no credentials hardcoded anywhere; `.env` and `bruno/.env` remain gitignored; Bruno dotenv secrets accessed via `{{process.env.VAR}}` / `bru.getProcessEnv()` (not plaintext in `.bru` files); no sensitive data in committed config files (`.actrc`, `playwright.config.ts`, etc.); `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD` sourced only from `.env` (local) or GitHub Actions secrets (CI)
- **Formatting** — code is formatted with Prettier (`npm run format` from `playwright/typescript/`); never commit files that would fail `npm run format:check`
- **Test tags** — every test (or its enclosing `test.describe`) must carry exactly one tag: `{ tag: '@smoke' }` for title/heading/HTTP status checks, `{ tag: '@regression' }` for deep content checks (table data, SVG analysis, link hrefs, accessibility, visual); new tests must follow the tag strategy documented in `README.md`
- **Consistency with existing patterns** — new utils and test files documented in `README.md` (including the "Single test file" run list and the spec file description in the Architecture section); new spec files must also appear in the "Test tags" table and carry the appropriate tag; new page files exported via the appropriate `index.ts`; code style matches surrounding files; JSON/config files are valid (no stray braces, no syntax errors)

---

## GitHub issue format

When creating GitHub issues for requirements, bugs, or code review findings, use this structure:

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

---

## Commit message convention

Commit messages are always a **short, single-line description** with no body and no `Co-Authored-By` trailer. When a commit relates to one or more GitHub issues, **prefix the message with the issue number(s)** separated by spaces, followed by the description:

- Single issue: `63 Add network mocking tests`
- Multiple issues: `63 64 Add network mocking tests and fixtures`
- No issue: `Fix typo in README`

The ticket prefix must come first so `git log --oneline` and GitHub cross-references work at a glance.

---

## Issue fix workflow

When fixing a GitHub issue, follow these steps in order:

1. Make the code change
2. Run `tsc --noEmit` — must pass with no errors
3. Run `npm run format` — auto-formats all files; no manual style fixes needed
4. Review against the [code review checklist](#code-review-checklist)
5. Run the affected test(s) — must pass
6. Create a branch from remote `main` named `feature/<issue-number>` or `bugfix/<issue-number>` (e.g. `feature/19`)
7. **Review the diff as a fresh reviewer** — run `git diff` (staged + unstaged) and treat every changed file as unfamiliar code. Work through the checklist below and **explicitly state each finding** (even if the finding is "no issues"). Saying "the diff looks clean" without articulating the checks performed is not acceptable.

   **General checks (every diff):**
   - Every non-obvious change: *"Would I understand why this was done just from the diff?"* If no, add a code comment or adjust the implementation.
   - No credentials, tokens, or secrets in committed files.
   - No dead code, commented-out blocks, or debug artifacts left in.
   - Docs updated: if a file documented in `README.md` changed, verify it reflects the change.

   **CI / workflow files (`.github/workflows/*.yml`):**
   - `timeout-minutes` set at the job level — no job should run unbounded.
   - All `actions/*` pinned to a specific major version (e.g. `@v4`); third-party actions pinned to a full SHA.
   - `node-version: lts/*` is acceptable for Node setup; npm package versions must be pinned in `package.json` + `package-lock.json` (use `npm ci`, not `npm install -g @package`).
   - No env vars copied blindly from another workflow without verifying they apply — each env var must have a reason visible in the file or a comment.
   - Secrets written to disk (e.g. `echo "KEY=${{ secrets.KEY }}" >> .env`) must be scoped to the minimum needed and never logged.
   - Steps that only make sense in specific contexts (e.g. artifact upload skipped under `act`) must have an `if:` condition with a clear comment explaining the guard.
8. **Verify all acceptance criteria and the Definition of Done** — read every Given/When/Then scenario and every DoD checkbox in the issue. For each item, explicitly confirm it is satisfied or identify what is missing. Do not proceed to commit until all criteria pass.
9. Commit following the [commit message convention](#commit-message-convention) — prefix with the issue number (e.g. `19 Add explicit SvgAnalysis type to page.evaluate()`).
10. Push and create a PR — the PR body must include:
    - `Closes #<issue-number>` so GitHub links and auto-closes the issue on merge
    - A **Test plan** section with a checklist of observable, verifiable steps. Mark steps already verified during development as `[x]`. Steps that require a reviewer or CI to verify must be left as `[ ]`.
11. **Verify the PR test plan** — after the PR is created, re-read every test plan item. For each `[ ]` item that can be verified now, execute and confirm it. Update the PR body via `gh pr edit` to mark newly confirmed items as `[x]`. For items that genuinely require a reviewer or CI, leave them as `[ ]` and note what is needed. If any item is found to be wrong or failing, implement a fix on the **same branch**: apply the fix, run tsc and format, work through the code review checklist, run the affected tests, then commit and push to the same branch before considering the task done.
