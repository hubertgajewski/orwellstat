---
description: Review staged and unstaged changes against the project's code review checklist.
---

First, run `/security-review` (built-in Claude Code command: "Complete a security review of the pending changes on the current branch"). If the command is unavailable, manually check for injection via untrusted input, path traversal in file I/O, unhandled parse errors, hardcoded secrets, and overly broad permissions. Fix any findings before proceeding.

Next, run `/simplify` (built-in Claude Code command: "Review changed code for reuse, quality, and efficiency, then fix any issues found"). If the command is unavailable, manually check for code duplication, unnecessary complexity, missed reuse of existing utilities, and inefficient patterns. Fix any findings before proceeding.

If `/simplify` made any changes, re-run `/security-review` and then `/simplify` again. Repeat this cycle until both pass with no findings. Stop after 3 cycles — if both have not converged by then, report the remaining findings to the user and ask how to proceed.

Then run `git diff HEAD` to see all changes and work through every item in the checklist below. For each item, explicitly state a finding: **pass**, **fail** (with the specific problem), or **N/A** (with the reason it does not apply). Saying "no issues" without articulating what was checked is not acceptable.

Also apply the general diff checks and (if `.github/workflows/*.yml` files changed) the CI workflow checks from the **"Review the diff as a fresh reviewer"** step in `.claude/skills/fix-issue/SKILL.md`.

After completing all checks, provide a summary: total pass / fail / N/A counts and a prioritised list of any failures that must be fixed before committing.

---

## Code review checklist

Review all changed files against these criteria. Items that are specific to `playwright/typescript` (e.g. POM conventions, fixture usage, test tags) are N/A for changes outside that directory:

- **Playwright test correctness** — selectors use `getByRole()` / `getByText()` with `exact: true`; no CSS class selectors; no `waitForTimeout()`; count asserted before `.nth()`; no `.first()` silencing missing elements; assertions are specific and meaningful (not just `toBeTruthy()`)
- **Fixture usage** — custom fixtures from `base.fixture.ts` used where appropriate; tests using `authenticatedRequest` or `unauthenticatedRequest` import from `@fixtures/api.fixture` (not `@fixtures/base.fixture`); no manual login logic duplicated outside `auth.setup.ts`; imports never come directly from `@playwright/test`
- **Page Object Model conventions** — page classes extend `AbstractPage`; `heading` getter uses `getByRole('heading', { name: ..., exact: true })`; static `url`, `title`, `accessKey` defined; no page-specific logic leaking into test files
- **TypeScript quality** — no `!` non-null assertions on env vars; `page.evaluate()` calls have explicit generic type; no implicit `any`; no unused imports; path aliases used instead of relative imports (`@fixtures/*`, `@pages/*`, `@utils/*`, `@test-data/*`, `@types-local/*`); explicit type annotations are present wherever inference is unreliable or lossy: module-level constant arrays iterated in tests use `as const satisfies readonly ElementType[]` (both `as const` to preserve literal types and `satisfies` to validate element type); `as SomeType` casts are not used as an escape hatch to silence type errors — prefer narrowing or `satisfies`; object literals with a known shape use `satisfies Interface` so excess-property and missing-property errors are caught at the definition site
- **Potential bugs** — async/await not missing on Playwright calls; no unhandled promise rejections; locators not reused across navigations; any file reading `process.env` credentials calls `loadEnv(import.meta.url, N)` at module top level (missing this passes on CI but fails locally)
- **Flakiness** — no fixed timeouts; animation waits use `requestAnimationFrame`; auth setup asserts login actually succeeded; no assumptions about element order without explicit count assertion
- **Security** — `.env` and `bruno/.env` remain gitignored; Bruno dotenv secrets accessed via `{{process.env.VAR}}` / `bru.getProcessEnv()` (not plaintext in `.bru` files); no sensitive data in committed config files (`.actrc`, `playwright.config.ts`, etc.); `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD` sourced only from `.env` (local) or GitHub Actions secrets (CI)
- **Formatting** — code is formatted with Prettier (`npm run format` from `playwright/typescript/`); never commit files that would fail `npm run format:check`
- **Test tags** — every test (or its enclosing `test.describe`) must carry exactly one tag: `{ tag: '@smoke' }` for title/heading/HTTP status checks, `{ tag: '@regression' }` for deep content checks (table data, SVG analysis, link hrefs, accessibility, visual); new tests must follow the tag strategy documented in `README.md`
- **Consistency with existing patterns** — new utils and test files documented in `README.md` (including the "Single test file" run list and the spec file description in the Architecture section); new spec files must also appear in the "Test tags" table and carry the appropriate tag; new page files exported via the appropriate `index.ts`; code style matches surrounding files; JSON/config files are valid (no stray braces, no syntax errors)
- **Coverage matrix** — if any spec file was added or modified, check whether the change covers a page × category combination currently marked `false` in `playwright/typescript/coverage-matrix.json`; if so, flip the relevant boolean(s) to `true` in the same commit; categories are: `title` (page title assertion), `content` (headings/tables/links), `accessibility` (axe-core scan), `visualRegression` (`toHaveScreenshot()`), `api` (HTTP status assertion), `forms` (form interaction); if a new page or form was added to the application, add it to the matrix as all-`false` (or `true` if this change also tests it)
- **CI workflow local smoke test** — for any new or modified `.github/workflows/*.yml`, run the workflow locally with `act` and confirm all steps pass; this catches missing tools, permission errors, and script bugs before they reach CI (see the Running GitHub Actions locally section in `README.md` for the correct `act` command per platform; `--container-architecture linux/amd64` is set automatically via `.actrc` and does not need to be passed manually)
