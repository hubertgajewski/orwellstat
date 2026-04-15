---
description: Scaffold Playwright tests for one page based on its class and coverage-matrix gaps.
---

Page identifier: $ARGUMENTS

Generate Playwright test scaffolds for a single page, driven by the gaps recorded in `playwright/typescript/coverage-matrix.json`. The scaffolds are real `test.fixme()` blocks with imports, navigation, and a TODO marker so that CI does not run an unfilled test, but the user only needs to write the actual assertions. Existing spec files are **appended to**, never overwritten; new files are only created when the target does not exist.

This skill is the targeted, per-page counterpart to `/generate-stubs` (which sweeps the whole matrix at once). Use it when you want to drop fresh scaffolding into one page's spec file after flipping new values to `false` in the matrix.

**Step 1 — Resolve the page identifier**

The user may pass any of: URL (`/register/`), class name (`RegisterPage`, case-insensitive), page-file stem (`register`, `register.page`). Match `$ARGUMENTS` against this table; the match must be unambiguous.

| URL | Class | Import | File stem |
|---|---|---|---|
| `/` | `HomePage` | `@pages/public` | `home` |
| `/about/` | `AboutSystemPage` | `@pages/public` | `about-system` |
| `/statistics/` | `ServiceStatisticsPage` | `@pages/public` | `service-statistics` |
| `/contact/` | `ContactPage` | `@pages/public` | `contact` |
| `/register/` | `RegisterPage` | `@pages/public` | `register` |
| `/2/` | `PreviouslyAddedPage` | `@pages/public/previously-added.page` | `previously-added` |
| `/password_reset/` | `PasswordResetPage` | `@pages/public` | `password-reset` |
| `/zone/` | `InformationPage` | `@pages/authenticated` | `information` |
| `/zone/stats/` | `StatsPage` | `@pages/authenticated` | `stats` |
| `/zone/hits/` | `HitsPage` | `@pages/authenticated` | `hits` |
| `/zone/scripts/` | `ScriptsPage` | `@pages/authenticated` | `scripts` |
| `/zone/admin/` | `AdminPage` | `@pages/authenticated` | `admin` |

If `$ARGUMENTS` is empty, matches nothing, or matches more than one row, stop and ask the user to pick from the list.

**Step 2 — Read the coverage matrix**

Read `playwright/typescript/coverage-matrix.json`. Locate the entry under `pages` whose key equals the resolved URL. If the URL is not present, stop and ask the user whether to add it to the matrix first — do not invent an entry.

**Step 3 — Identify gaps**

Check the page's `content`, `accessibility`, and `visualRegression` values. Skip `title` and `api` — those are covered by the data-driven loops in `navigation.spec.ts` and `api.spec.ts`. Record each `false` value as a gap. If none are `false`, print "No content/accessibility/visual gaps for `{url}` in `coverage-matrix.json` — nothing to scaffold." and stop.

**Step 4 — Data-driven accessibility conflict check**

If accessibility is a gap, read `playwright/typescript/pages/public/index.ts` and `playwright/typescript/pages/authenticated/index.ts` and check whether the page class is in `PUBLIC_PAGE_CLASSES` or `AUTHENTICATED_PAGE_CLASSES`.

If it **is** in the array, the data-driven loop in `accessibility.spec.ts` already covers it. Do not scaffold an accessibility test; instead warn:

> Page `{url}` (`{ClassName}`) is in `{PUBLIC|AUTHENTICATED}_PAGE_CLASSES`, so `accessibility.spec.ts` already covers it via the data-driven loop. Flip `accessibility` to `true` in `coverage-matrix.json` instead of adding a standalone test.

Continue with the remaining gaps.

**Special case:** `PreviouslyAddedPage` (`/2/`) is deliberately excluded from `PUBLIC_PAGE_CLASSES`. For this page, proceed with a standalone accessibility scaffold but flag to the user that adding it to the array would cover title, accessibility, and API at once via existing loops.

**Step 5 — Map each gap to a target file**

| Gap | Target file | Action when file exists |
|---|---|---|
| `content` | see content-file mapping below | append |
| `accessibility` | `playwright/typescript/tests/accessibility.spec.ts` | append inside the existing `test.describe('accessibility', ...)` block, after the two `for` loops |
| `visualRegression` | `playwright/typescript/tests/visual.spec.ts` | append at the bottom of the file |

Content-file mapping:

- `/` → `home.spec.ts`
- `/about/` → `about-system.spec.ts`
- `/statistics/` → `statistics.spec.ts`
- `/contact/` → `contact.spec.ts`
- `/register/` → `register.spec.ts` (new)
- `/2/` → `previously-added.spec.ts` (new)
- `/password_reset/` → `password-reset.spec.ts` (new)
- `/zone/` → `zone-information.spec.ts` (new)
- `/zone/stats/` → `zone-stats.spec.ts` (new)
- `/zone/hits/` → `zone-hits.spec.ts` (new)
- `/zone/scripts/` → `zone-scripts.spec.ts` (new)
- `/zone/admin/` → `zone-admin.spec.ts` (new)

**Step 6 — Preflight: never overwrite, never duplicate**

For each target file:

1. Check whether the file exists. If it does **not**, you will create it with the Write tool in Step 7. Use Write only after confirming non-existence — Write silently overwrites.
2. If the file **does** exist, read it. Search for the exact test title string the scaffold will use (see Step 7). If already present, skip that scaffold and warn: `Skipping {category} scaffold for {url} — '{test title}' already exists in {file}.`
3. If the file exists but the page class import is missing, add the import near the top of the file (alongside the existing imports) using Edit. Do not rewrite unrelated imports.

**Step 7 — Generate scaffolds**

All scaffolds are `test.fixme()` so unfinished scaffolds do not run in CI. The user replaces `fixme` with `test` once the assertions are filled in.

**Content scaffold** — appended to or created in the content target file. Test title: `{pageName} page - content`, where `{pageName}` is the class name with `Page` stripped and split from camelCase into lowercase space-separated words (`RegisterPage` → `register`, `PasswordResetPage` → `password reset`, `ServiceStatisticsPage` → `service statistics`). This matches the title format produced by `/generate-stubs` so the Step 6 duplicate guard catches stubs planted by either skill.

New file template:
```typescript
import { test, expect } from '@fixtures/base.fixture';
import { {ClassName} } from '{importPath}';

test.fixme('{pageName} page - content', { tag: '@regression' }, async ({ page }) => {
  await page.goto({ClassName}.url);
  const pageObject = new {ClassName}(page);
  await expect(pageObject.heading).toBeVisible();
  // TODO: Assert page content — additional headings, sections, links, tables, form fields.
});
```

Append to existing file (import added separately if missing):
```typescript

test.fixme('{pageName} page - content', { tag: '@regression' }, async ({ page }) => {
  await page.goto({ClassName}.url);
  const pageObject = new {ClassName}(page);
  await expect(pageObject.heading).toBeVisible();
  // TODO: Assert page content — additional headings, sections, links, tables, form fields.
});
```

**Accessibility scaffold** — appended inside the existing `test.describe('accessibility', ...)` block in `accessibility.spec.ts`, after both `for` loops. Only emit this when Step 4 did not flag the page as already covered.

```typescript

  test.fixme('{url}', async ({ page }) => {
    await page.goto({ClassName}.url);
    await expectNoAccessibilityViolations(page);
    // TODO: Add {ClassName} to {PUBLIC|AUTHENTICATED}_PAGE_CLASSES to replace this standalone
    // test with the data-driven loop above, or remove this comment once the test is finalised.
  });
```

Add the page-class import at the top of `accessibility.spec.ts` if missing.

**Visual regression scaffold** — appended at the bottom of `visual.spec.ts`. Test title: `{pageName} page visual regression`, using the same `{pageName}` derivation as the content scaffold.

```typescript

test.fixme('{pageName} page visual regression', { tag: '@regression' }, async ({ page }) => {
  await page.goto({ClassName}.url);
  // TODO: Add a toHaveScreenshot() assertion. Mask any dynamic content (live data tables,
  // SVG charts, #statsbar lists) so the baseline is deterministic.
  await expect(page).toHaveScreenshot({ fullPage: true });
});
```

Add the page-class import at the top of `visual.spec.ts` if missing.

**Step 8 — Update README.md for new spec files**

If Step 7 **created** any new spec files, update `README.md`:

1. Add the file to the "Single test file" run list under "Running tests".
2. Add an entry to the spec file description list under "Architecture → Directory structure → `tests/`".
3. Add the file to the "Test tags" table under `@regression`.

If no new files were created, do not touch `README.md`.

**Step 9 — Do not flip the coverage matrix**

Do **not** edit `coverage-matrix.json`. Scaffolds are unfinished tests; the matrix should only flip to `true` once the scaffold is replaced with real, passing assertions.

**Step 10 — Summary**

Print a summary in this shape:

```
Scaffolded for {url} ({ClassName}):
- content: {created|appended|skipped} → tests/{file}
- accessibility: {appended|skipped-data-driven|skipped-already-exists} → tests/accessibility.spec.ts
- visualRegression: {appended|skipped} → tests/visual.spec.ts

Warnings:
- (any data-driven conflict from Step 4)
- (any PreviouslyAddedPage flag)
- (any duplicate-skip message from Step 6)

Next steps:
- Replace each test.fixme() with test() once assertions are filled in.
- Flip the corresponding value in coverage-matrix.json to true in the same commit that adds real assertions.
- Run `npx playwright test tests/{file}` to verify.
```
