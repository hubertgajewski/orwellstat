# CLAUDE.md

This file provides behavioral instructions to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep `README.md` up to date.** Whenever the project structure changes — new directories, renamed files, new sub-projects, changed commands, updated CI, modified environment variables — update `README.md` before finishing the task. `CLAUDE.md` documents behavioral instructions only; update it only when adding, changing, or removing behavioral guidance for Claude — such as the code review checklist, issue format, issue fix workflow, or any other conventions Claude should follow.

> **Skill files are the source of truth for their workflows.** `.claude/skills/fix-issue/SKILL.md` owns the issue fix workflow; `.claude/skills/create-issue/SKILL.md` owns the GitHub issue format. `CLAUDE.md` only points to them. When changing those workflows or formats, edit the skill file — not this file.

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

When creating GitHub issues for requirements, bugs, or code review findings, follow the format and steps in `.claude/skills/create-issue/SKILL.md`.

---

## Commit message convention

Commit messages are always a **short, single-line description** with no body and no `Co-Authored-By` trailer. When a commit relates to one or more GitHub issues, **prefix the message with the issue number(s)** separated by spaces, followed by the description:

- Single issue: `63 Add network mocking tests`
- Multiple issues: `63 64 Add network mocking tests and fixtures`
- No issue: `Fix typo in README`

The ticket prefix must come first so `git log --oneline` and GitHub cross-references work at a glance.

---

## Issue fix workflow

When fixing a GitHub issue, follow the steps in `.claude/skills/fix-issue/SKILL.md`.
