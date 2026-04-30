---
description: Review staged and unstaged changes against the project's code review checklist, with security delegated to the OWASP/CWE-anchored deep-review-security agent (replaces the built-in /security-review).
---

This is the next-generation review skill. It runs alongside `/deep-review` while the rollout is validated; once judged superior, a follow-up ticket will swap the default and retire `/deep-review`. Until then **do not change** `.claude/skills/deep-review/SKILL.md` from this skill — the two coexist.

The flow mirrors `/deep-review` exactly, with one swap: the security step dispatches a project-scoped agent (`deep-review-security`) instead of the built-in `/security-review`. Everything else — `/simplify`, the code review checklist, the doc-consistency sub-agent, the general diff and CI workflow checks — is identical to `/deep-review`.

First, dispatch the security agent:

```
Task(subagent_type="deep-review-security", description="Security review of pending diff", prompt="Review the current staged + unstaged diff for OWASP Top 10 / CWE Top 25 / ASVS / Cheat-Sheet-class vulnerabilities and emit findings in the documented schema.")
```

The agent emits one line per finding using the schema:

```
<severity> | <category> | <file>:<line> | <description with [STD-ID] citations> | <recommended fix>
```

followed by a `summary:` line, or — when there are no findings — `findings: none` followed by `summary: 0 high / 0 medium / 0 low`. The categories are `access-control`, `crypto`, `injection`, `availability`, `misconfiguration`, `supply-chain`, `authentication`, `integrity`, `logging`, `ssrf`, and `data-exposure`. Fix every `HIGH` and every `MEDIUM` before proceeding; a `LOW` finding may be deferred with a one-sentence justification.

Next, run `/simplify` (built-in Claude Code command: "Review changed code for reuse, quality, and efficiency, then fix any issues found"). If the command is unavailable, manually check for code duplication, unnecessary complexity, missed reuse of existing utilities, and inefficient patterns. Fix any findings before proceeding.

If `/simplify` made any changes, re-dispatch the `deep-review-security` agent and then `/simplify` again. Repeat this cycle until both pass with no findings. Stop after 3 cycles — if both have not converged by then, report the remaining findings to the user and ask how to proceed.

Then run `git diff HEAD` to see all changes and work through every item in the checklist below. For each item, explicitly state a finding: **pass**, **fail** (with the specific problem), or **N/A** (with the reason it does not apply). Saying "no issues" without articulating what was checked is not acceptable.

Also apply the general diff checks and (if `.github/workflows/*.yml` files changed) the CI workflow checks from the **"Review the diff as a fresh reviewer"** step in `.claude/skills/fix-issue/SKILL.md`.

After completing all checks, provide a summary: total pass / fail / N/A counts and a prioritised list of any failures that must be fixed before committing.

---

## Code review checklist

The checklist is identical to `/deep-review`'s — see `.claude/skills/deep-review/SKILL.md` for the canonical wording. Items that are specific to `playwright/typescript` (e.g. POM conventions, fixture usage, test tags) are N/A for changes outside that directory:

- **Playwright test correctness** — selectors use `getByRole()` / `getByText()` with `exact: true`; no CSS class selectors; no `waitForTimeout()`; count asserted before `.nth()`; no `.first()` silencing missing elements; assertions are specific and meaningful (not just `toBeTruthy()`).
- **External-app text correctness** — sanity-check every literal string from the product under test for upstream bugs (typos, broken grammar, wrong numbers, missing diacritics) before pinning it; never silently encode a bug into the assertion. If a string looks wrong, file an upstream issue and either hold the test or link the issue in a comment.
- **Fixture usage** — custom fixtures from `base.fixture.ts`; tests using `authenticatedRequest` / `unauthenticatedRequest` import from `@fixtures/api.fixture`; no manual login logic outside `auth.setup.ts`; imports never come directly from `@playwright/test`; tests asserting empty-state UI opt in via `test.use({ storageState: EMPTY_STORAGE_STATE })` from `@fixtures/storage-state` (or `test.use({ authAccount: 'empty' })` for API fixtures) — never branch at runtime on which account is logged in.
- **Page Object Model conventions** — page classes extend `AbstractPage`; `heading` getter uses `getByRole('heading', { name: ..., exact: true })`; static `url`, `title`, `accessKey` defined; no page-specific logic leaking into test files.
- **TypeScript quality** — no `!` non-null assertions on env vars; `page.evaluate()` calls have explicit generic type; no implicit `any`; no unused imports; path aliases used instead of relative imports (`@fixtures/*`, `@pages/*`, `@utils/*`, `@test-data/*`, `@types-local/*`); explicit type annotations where inference is unreliable; `as const satisfies readonly ElementType[]` on iterated literal arrays; `satisfies Interface` on object literals; no `as Type` escape-hatch casts.
- **Potential bugs** — async/await not missing on Playwright calls; no unhandled promise rejections; locators not reused across navigations; any file reading `process.env` credentials calls `loadEnv(import.meta.url, N)` at module top level.
- **Flakiness** — no fixed timeouts; animation waits use `requestAnimationFrame`; auth setup asserts login actually succeeded; no assumptions about element order without explicit count assertion.
- **Security** — already covered by the `deep-review-security` agent above. The checklist row remains as a final gate: `.env` and `bruno/.env` gitignored; Bruno secrets via `{{process.env.VAR}}` / `bru.getProcessEnv()`; no sensitive data in committed config files; `ORWELLSTAT_USER` / `ORWELLSTAT_PASSWORD` sourced only from `.env` (local) or GitHub Actions secrets (CI).
- **Formatting** — code formatted with Prettier (`npm run format` from `playwright/typescript/`); never commit files that would fail `npm run format:check`.
- **Test tags** — every test (or its enclosing `test.describe`) carries exactly one **category** tag (`@smoke` or `@regression`); scope tags additive; setup tests in `auth.setup.ts` exempt from the category-tag rule and carry only scope tags.
- **Consistency with existing patterns** — new utils and test files documented in `README.md`; new spec files appear in the "Test tags" table; new page files exported via `index.ts`; code style matches surrounding files; JSON / config files valid.
- **Coverage matrix** — flip relevant booleans in `playwright/typescript/coverage-matrix.json` when a spec covers a previously-`false` page × category combination; add new pages/forms as all-`false`.
- **CI workflow local smoke test** — for any new or modified `.github/workflows/*.yml`, run the workflow locally with `act` and confirm all steps pass.
- **Script and tooling coverage** — for any new or modified Python script under `scripts/` and any new or modified MCP server under `mcp/*/`, measure coverage and aim for ≥ 90% on added or changed code; document any uncovered lines in the PR body.

---

## Doc-consistency sub-agent

After the security agent and the checklist, dispatch the documentation reviewer:

```
Task(subagent_type="deep-review-docs", description="Doc consistency check", prompt="Verify the diff is reflected in the right doc per the project's documented split rules.")
```

It returns a list of pass / fail / N/A findings against the README / CLAUDE.md / skill-file split rules. Fix any failures before committing.
