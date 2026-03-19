Fix a GitHub issue end-to-end: fetch, implement, test, review, commit, and open a PR.

Issue number: $ARGUMENTS

**Step 1 — Fetch the issue**
Run `gh issue view $ARGUMENTS` and read every section: User Story, Context, Acceptance Criteria, Implementation Hint, and Definition of Done. State what the issue requires before touching any code.

**Step 2 — Make the code change**
Implement the fix described in the issue. Follow all conventions in CLAUDE.md (POM, fixtures, path aliases, security, etc.).

**Step 3 — Run `tsc --noEmit`**
From `playwright/typescript/`, run `npx tsc --noEmit`. It must exit with no errors before proceeding.

**Step 4 — Run `npm run format`**
From `playwright/typescript/`, run `npm run format`. This auto-formats all files; do not make manual style fixes.

**Step 5 — Review against the code review checklist**
Work through every item in the checklist from CLAUDE.md and explicitly state a finding for each (pass, fail, or N/A with reason):

- Playwright test correctness — selectors use `getByRole()` / `getByText()` with `exact: true`; no CSS class selectors; no `waitForTimeout()`; count asserted before `.nth()`; no `.first()` silencing missing elements; assertions are specific and meaningful (not just `toBeTruthy()`)
- Fixture usage — custom fixtures from `base.fixture.ts` used where appropriate; tests using `authenticatedRequest` or `unauthenticatedRequest` import from `@fixtures/api.fixture` (not `@fixtures/base.fixture`); no manual login logic duplicated outside `auth.setup.ts`; imports never come directly from `@playwright/test`
- Page Object Model conventions — page classes extend `AbstractPage`; `heading` getter uses `getByRole('heading', { name: ..., exact: true })`; static `url`, `title`, `accessKey` defined; no page-specific logic leaking into test files
- TypeScript quality — no `!` non-null assertions on env vars; `page.evaluate()` calls have explicit generic type; no implicit `any`; no unused imports; path aliases used instead of relative imports (`@fixtures/*`, `@pages/*`, `@utils/*`, `@test-data/*`, `@types-local/*`); `tsc --noEmit` passes
- Potential bugs — async/await not missing on Playwright calls; no unhandled promise rejections; locators not reused across navigations; any file reading `process.env` credentials calls `loadEnv(import.meta.url, N)` at module top level (missing this passes on CI but fails locally)
- Flakiness — no fixed timeouts; animation waits use `requestAnimationFrame`; auth setup asserts login actually succeeded; no assumptions about element order without explicit count assertion
- Security — no credentials hardcoded anywhere; `.env` and `bruno/.env` remain gitignored; Bruno dotenv secrets accessed via `{{process.env.VAR}}` / `bru.getProcessEnv()` (not plaintext in `.bru` files); no sensitive data in committed config files; `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD` sourced only from `.env` (local) or GitHub Actions secrets (CI)
- Formatting — code is formatted with Prettier (`npm run format` from `playwright/typescript/`); never commit files that would fail `npm run format:check`
- Test tags — every test (or its enclosing `test.describe`) must carry exactly one tag: `{ tag: '@smoke' }` for title/heading/HTTP status checks, `{ tag: '@regression' }` for deep content checks
- Consistency with existing patterns — new utils and test files documented in `README.md`; new spec files appear in the "Test tags" table; new page files exported via the appropriate `index.ts`; code style matches surrounding files; JSON/config files are valid

**Step 6 — Run the affected test(s)**
Run only the tests touched by the change. They must all pass before proceeding.

**Step 7 — Create the branch**
Create a branch from remote `main` named `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS` as appropriate (e.g. `git checkout -b feature/$ARGUMENTS origin/main`).

**Step 8 — Review the diff as a fresh reviewer**
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

**Step 9 — Verify all acceptance criteria and the Definition of Done**
Read every Given/When/Then scenario and every DoD checkbox in the issue. For each item, explicitly confirm it is satisfied or identify what is missing. Do not proceed to commit until all criteria pass.

**Step 10 — Commit**
Stage changed files by name (never `git add -A`). Commit with a short, single-line message in the format `$ARGUMENTS <short description>` (e.g. `$ARGUMENTS Add explicit SvgAnalysis type to page.evaluate()`). No body, no `Co-Authored-By` trailer — single line only.

**Step 11 — Push and create a PR**
Push the branch and run `gh pr create`. The PR body must include:
- `Closes #$ARGUMENTS` so GitHub links and auto-closes the issue on merge
- A **Test plan** section with a checklist of observable, verifiable steps. Mark steps already verified during development as `[x]`. Steps that require a reviewer or CI to verify must be left as `[ ]`.

**Step 12 — Verify the PR test plan**
Re-read every test plan item. For each `[ ]` item that can be verified now, execute and confirm it. Update the PR body via `gh pr edit` to mark newly confirmed items as `[x]`. For items that genuinely require a reviewer or CI, leave them as `[ ]` and note what is needed. If any item is found to be wrong or failing, implement a fix on the **same branch**: apply the fix, run tsc and format, work through the code review checklist, run the affected tests, then commit and push to the same branch before considering the task done.
