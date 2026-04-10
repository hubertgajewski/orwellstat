---
description: Generate test.fixme() stubs for uncovered combinations in the coverage matrix.
---

Generate `test.fixme()` stub tests for every uncovered page-category combination and uncovered form in the coverage matrix.

**Step 1 — Read the coverage matrix**

Read `playwright/typescript/coverage-matrix.json`. Parse both the `pages` and `forms` sections.

**Step 2 — Build the URL-to-page-class lookup**

Use this mapping to resolve each URL to a page class and import path:

| URL | Class | Import |
|---|---|---|
| `/` | `HomePage` | `@pages/public` |
| `/about/` | `AboutSystemPage` | `@pages/public` |
| `/statistics/` | `ServiceStatisticsPage` | `@pages/public` |
| `/contact/` | `ContactPage` | `@pages/public` |
| `/register/` | `RegisterPage` | `@pages/public` |
| `/2/` | `PreviouslyAddedPage` | `@pages/public/previously-added.page` |
| `/password_reset/` | `PasswordResetPage` | `@pages/public` |
| `/zone/` | `InformationPage` | `@pages/authenticated` |
| `/zone/stats/` | `StatsPage` | `@pages/authenticated` |
| `/zone/hits/` | `HitsPage` | `@pages/authenticated` |
| `/zone/scripts/` | `ScriptsPage` | `@pages/authenticated` |
| `/zone/admin/` | `AdminPage` | `@pages/authenticated` |

If a URL in the matrix is not in this table, stop and ask the user which page class it maps to.

**Step 3 — Identify gaps (pages)**

For each page, check each category. Skip `title` and `api` — those are covered by data-driven loops in `navigation.spec.ts` and `api.spec.ts`. For the remaining categories (`content`, `accessibility`, `visualRegression`) where the value is `false`, record a gap: `(url, category, PageClass, importPath)`.

**Step 4 — Identify gaps (forms)**

For each form in the `forms` section where the value is `false`, record a gap: `(formName)`.

**Step 5 — Check for data-driven coverage conflicts**

Before generating stubs, read `playwright/typescript/pages/public/index.ts` and `playwright/typescript/pages/authenticated/index.ts`. Check whether each page with `accessibility: false` is already in `PUBLIC_PAGE_CLASSES` or `AUTHENTICATED_PAGE_CLASSES`.

If a page IS in one of those arrays, `accessibility.spec.ts` already tests it via the data-driven loop. In that case:
- Do NOT generate an accessibility stub for that page.
- Warn the user: "Page `{url}` (`{ClassName}`) is in `{PUBLIC|AUTHENTICATED}_PAGE_CLASSES`, so `accessibility.spec.ts` already covers it. Flip `accessibility` to `true` in `coverage-matrix.json` instead of adding a stub."

**Step 6 — Generate accessibility stubs**

For each accessibility gap NOT resolved by Step 5, add a `test.fixme()` inside the existing `test.describe('accessibility', ...)` block in `playwright/typescript/tests/accessibility.spec.ts`. Place it after the existing `for` loops.

Format:
```typescript
test.fixme('{url}', async ({ page }) => {
  // TODO: Add {ClassName} to {PUBLIC|AUTHENTICATED}_PAGE_CLASSES
  // or test accessibility for {url} directly here
});
```

**Special case:** `PreviouslyAddedPage` (`/2/`) is deliberately excluded from `PUBLIC_PAGE_CLASSES`. Flag this to the user: "`PreviouslyAddedPage` is not in `PUBLIC_PAGE_CLASSES`. Adding it there would automatically cover title, accessibility, and API. Decide whether to add it to the array or write standalone tests."

**Step 7 — Generate visual regression stubs**

For each `visualRegression: false` gap, add a `test.fixme()` to `playwright/typescript/tests/visual.spec.ts`. Add the page class import if not already present.

Format:
```typescript
test.fixme('{pageName} visual regression', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to {ClassName}.url and add toHaveScreenshot() assertion
});
```

Where `{pageName}` is a human-readable name derived from the class (e.g., `RegisterPage` → `register page`). Follow the naming convention of existing tests in the file.

**Special case:** `PreviouslyAddedPage` — flag for the user: "`PreviouslyAddedPage` was added after the initial visual baselines. Verify whether a baseline image already exists or needs to be generated."

**Step 8 — Generate content stubs**

For each `content: false` gap, determine the target file:

1. Check if an existing spec file covers that page's content:
   - `/` → `home.spec.ts`
   - `/about/` → `about-system.spec.ts`
   - `/statistics/` → `statistics.spec.ts`
   - `/contact/` → `contact.spec.ts`

2. If an existing file exists, append the `test.fixme()` at the end. Also add the page class import at the top of the file if it is not already imported.

3. If no file exists, create a new spec file:
   - `/register/` → `register.spec.ts`
   - `/password_reset/` → `password-reset.spec.ts`
   - `/zone/` → `zone-information.spec.ts`
   - `/zone/stats/` → `zone-stats.spec.ts`
   - `/zone/hits/` → `zone-hits.spec.ts`
   - `/zone/scripts/` → `zone-scripts.spec.ts`
   - `/zone/admin/` → `zone-admin.spec.ts`

New file template:
```typescript
import { test, expect } from '@fixtures/base.fixture';
import { {ClassName} } from '{importPath}';

test.fixme('{pageName} - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to {ClassName}.url and verify page content
  // (headings, sections, links, tables, etc.)
});
```

Existing file — append:
```typescript
test.fixme('{pageName} - content', { tag: '@regression' }, async ({ page }) => {
  // TODO: Add content assertions for {ClassName}
});
```

**Step 9 — Generate form stubs**

For each uncovered form, add stubs to `playwright/typescript/tests/forms.spec.ts`. Create the file if it does not exist.

Form-to-page mapping:
- `login` → the login form appears on every page via `#statsbar`; use `/` as the entry point, import `HomePage` from `@pages/public`
- `hitsFilter` → `HitsPage` from `@pages/authenticated`
- `adminSettings` → `AdminPage` from `@pages/authenticated`

Template for a new `forms.spec.ts`:
```typescript
import { test, expect } from '@fixtures/base.fixture';
```

Add the appropriate page class imports, then for each form:
```typescript
test.fixme('{formName} form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to the page containing the {formName} form,
  // fill in fields, submit, and verify the result
});
```

**Step 10 — Update README.md**

If any new spec files were created in Step 8 or Step 9, add them to:
1. The "Single test file" run list under "Running tests"
2. The spec file description list under "Architecture"
3. The "Test tags" table with the appropriate tag (`@regression`)

**Step 11 — Summary**

Print a summary:

```
Stubs generated:
- accessibility: N stubs in accessibility.spec.ts
- visualRegression: N stubs in visual.spec.ts
- content: N stubs across M files (list files)
- forms: N stubs in forms.spec.ts

Warnings:
- (list any data-driven coverage conflicts from Step 5)
- (list any PreviouslyAddedPage flags)
- (list any unknown URLs)

Next steps:
- Implement each test.fixme() stub
- After implementing, flip the corresponding value in coverage-matrix.json to true
- Run npx playwright test to verify
```

Do NOT flip any values in `coverage-matrix.json` — stubs are not implemented tests. Values should only change to `true` when stubs are replaced with real test implementations.
