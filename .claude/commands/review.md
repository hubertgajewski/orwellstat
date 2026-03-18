> **Maintenance:** This file embeds the code review checklist from `CLAUDE.md` verbatim. Whenever that section in `CLAUDE.md` changes, update this file to match.

Review all staged and unstaged changes against the code review checklist from CLAUDE.md.

Run `git diff HEAD` to see all changes, then work through every checklist item below. For each item, explicitly state a finding: **pass**, **fail** (with the specific problem), or **N/A** (with the reason it does not apply). Saying "no issues" without articulating what was checked is not acceptable.

---

## Playwright test correctness
- Selectors use `getByRole()` / `getByText()` with `exact: true`
- No CSS class selectors
- No `waitForTimeout()`
- Count asserted before `.nth()`
- No `.first()` silencing missing elements
- Assertions are specific and meaningful (not just `toBeTruthy()`)

## Fixture usage
- Custom fixtures from `base.fixture.ts` used where appropriate
- Tests using `authenticatedRequest` or `unauthenticatedRequest` import from `@fixtures/api.fixture` (not `@fixtures/base.fixture`)
- No manual login logic duplicated outside `auth.setup.ts`
- Imports never come directly from `@playwright/test`

## Page Object Model conventions
- Page classes extend `AbstractPage`
- `heading` getter uses `getByRole('heading', { name: ..., exact: true })`
- Static `url`, `title`, `accessKey` defined
- No page-specific logic leaking into test files

## TypeScript quality
- No `!` non-null assertions on env vars
- `page.evaluate()` calls have explicit generic type
- No implicit `any`
- No unused imports
- Path aliases used instead of relative imports (`@fixtures/*`, `@pages/*`, `@utils/*`, `@test-data/*`, `@types-local/*`)
- `tsc --noEmit` passes

## Potential bugs
- async/await not missing on Playwright calls
- No unhandled promise rejections
- Locators not reused across navigations
- Any file reading `process.env` credentials calls `loadEnv(import.meta.url, N)` at module top level

## Flakiness
- No fixed timeouts
- Animation waits use `requestAnimationFrame`
- Auth setup asserts login actually succeeded
- No assumptions about element order without explicit count assertion

## Security
- No credentials hardcoded anywhere
- `.env` and `bruno/.env` remain gitignored
- Bruno dotenv secrets accessed via `{{process.env.VAR}}` / `bru.getProcessEnv()` (not plaintext in `.bru` files)
- No sensitive data in committed config files (`.actrc`, `playwright.config.ts`, etc.)
- `ORWELLSTAT_USER`/`ORWELLSTAT_PASSWORD` sourced only from `.env` (local) or GitHub Actions secrets (CI)

## Formatting
- Code is formatted with Prettier (`npm run format` from `playwright/typescript/`)
- No files would fail `npm run format:check`

## Test tags
- Every test (or its enclosing `test.describe`) carries exactly one tag
- `{ tag: '@smoke' }` for title/heading/HTTP status checks
- `{ tag: '@regression' }` for deep content checks (table data, SVG analysis, link hrefs, accessibility, visual)

## Consistency with existing patterns
- New utils and test files documented in `README.md` (including the "Single test file" run list and the spec file description in the Architecture section)
- New spec files appear in the "Test tags" table and carry the appropriate tag
- New page files exported via the appropriate `index.ts`
- Code style matches surrounding files
- JSON/config files are valid (no stray braces, no syntax errors)

## General diff checks
- Every non-obvious change: "Would I understand why this was done just from the diff?" If no, flag it.
- No credentials, tokens, or secrets in committed files
- No dead code, commented-out blocks, or debug artifacts left in
- Docs updated: if a file documented in `README.md` changed, verify `README.md` reflects the change

## CI / workflow files (if `.github/workflows/*.yml` changed)
- `timeout-minutes` set at the job level
- All `actions/*` pinned to a specific major version (e.g. `@v4`); third-party actions pinned to a full SHA
- `node-version: lts/*` is acceptable; npm package versions pinned in `package.json` + `package-lock.json`
- No env vars copied blindly from another workflow without a visible reason
- Secrets written to disk scoped to minimum needed and never logged
- Steps that only make sense in specific contexts have an `if:` condition with a comment

---

After completing all checks, provide a summary: total pass / fail / N/A counts and a prioritised list of any failures that must be fixed before committing.
