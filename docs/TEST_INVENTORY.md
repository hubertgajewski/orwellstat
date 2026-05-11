# Test Inventory

This file describes what each Playwright spec covers. For commands, tags, fixtures, POM conventions, and config behavior, see [PLAYWRIGHT.md](PLAYWRIGHT.md).

## Smoke Specs

| Spec                       | Scope                    | Coverage                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/navigation.spec.ts` | UI navigation and titles | Verifies public and authenticated page navigation and title/heading visibility. Tagged `@smoke`.                                                                                                                                                                  |
| `tests/api.spec.ts`        | HTTP-level behavior      | Covers public and authenticated page status checks plus `/zone/` login CSRF gates. Failed-authentication flow extracts the rendered `_csrf` input before posting bad credentials; sibling tests pin missing and mismatched CSRF rejection paths. Tagged `@smoke`. |

## Public Page Regression Specs

| Spec                           | Scope                               | Coverage                                                                                   |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `tests/home.spec.ts`           | Home page and previously-added page | Content, navigation, and shared public-page expectations, including `PreviouslyAddedPage`. |
| `tests/about-system.spec.ts`   | About System page                   | Headings and statsbar content.                                                             |
| `tests/contact.spec.ts`        | Contact page                        | Headings and statsbar content.                                                             |
| `tests/statistics.spec.ts`     | Public statistics page              | SVG chart rendering, statistics table checks, and chart/table structural analysis.         |
| `tests/register.spec.ts`       | `/register/`                        | Heading, registration field editability, enabled submit button, and unique login nav link. |
| `tests/password-reset.spec.ts` | `/password_reset/`                  | Heading, scoped recovery-form username input, enabled reset button, and home-link target.  |

## Authenticated Page Regression Specs

| Spec                             | Scope            | Coverage                                                                                                                                                                                                                                |
| -------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/zone-information.spec.ts` | `/zone/`         | Populated-account headings, visit frequency, ranking lines, footer prose, and hit link; empty-account heading and absence of populated-only locators.                                                                                   |
| `tests/zone-stats.spec.ts`       | `/zone/stats/`   | Empty-account no-chart/no-table state; SVG chart structural analysis, user-statistics table, and parameterized `Parametr` loop comparing chart labels/percentages against data-table rows for all 12 dimensions.                        |
| `tests/zone-hits.spec.ts`        | `/zone/hits/`    | Empty-account filter and no-results state; static content plus parameterized filter-form suite: seed, filter, assert matching row, max-length boundary, zero-result boundary, and row-limit combobox.                                   |
| `tests/zone-scripts.spec.ts`     | `/zone/scripts/` | Empty-account snippet rendering; snippet textarea content against `test-data/scripts/snippet-*.txt`; and E2E tracking tests for HTML5, HTML4, and XHTML embed variants.                                                                 |
| `tests/zone-admin.spec.ts`       | `/zone/admin/`   | Empty-account non-mutating settings fields; static page surface, settings-form default state, per-field maxlength, wrong-password path, placeholder-email non-mutating path, real-credential mismatch path, and mutating restore flows. |

## Cross-Cutting Regression Specs

| Spec                            | Scope                          | Coverage                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/accessibility.spec.ts`   | Public and authenticated pages | Axe WCAG accessibility scans across page classes.                                                                                                                                                                                                                                                                   |
| `tests/validation.spec.ts`      | XHTML and CSS validation       | XHTML 1.0 Strict and CSS validation across pages. Default path is local and offline; `VALIDATE_REMOTE=true` uses classic W3C services for periodic cross-checking. Chromium-only.                                                                                                                                   |
| `tests/network-mocking.spec.ts` | Network mocking                | Uses `page.route()` to mock SVG chart responses and W3C validator error responses for deterministic and negative-path coverage. Chromium-only.                                                                                                                                                                      |
| `tests/visual.spec.ts`          | Visual regression              | Full-page screenshots for public pages, authenticated pages, style variants, and shared UI. Masks logged-in usernames, live stats tables, dynamic SVG charts, IP/account identifiers, snippet textareas, and other volatile fields. Baselines live in `tests/visual.spec.ts-snapshots/` with per-platform suffixes. |
| `tests/forms.spec.ts`           | Form coverage stubs            | Contains the `test.fixme` stub for the `login` form. `hitsFilter` and `adminSettings` are covered in their respective zone specs.                                                                                                                                                                                   |

## Unit Test Suites

| Spec                                            | Scope                             | Coverage                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `utils/svg-chart-table.util.test.ts`            | XHTML table extraction            | Parses captured XHTML as `application/xhtml+xml`, trims cells, respects row limits, and returns `[]` on parse error or missing table.                                          |
| `utils/svg-chart-percent.util.test.ts`          | Chart/table percentage comparison | Covers bracket stripping, integer-hundredths gap math, tolerance boundaries, and empirical 4-hundredths gaps.                                                                  |
| `utils/diagnosis.util.test.ts`                  | AI-diagnosis redaction            | Exercises cookie, set-cookie, bearer, API key, query token, JWT, email, mixed, no-match, char-budget, XHTML-structure, multiline, order-sensitivity, and bypass-attempt cases. |
| `utils/css-validator.util.test.ts`              | CSS validation formatting         | Verifies intentionally broken CSS reports per-line errors with line numbers and source URL.                                                                                    |
| `scripts/verify-coverage-matrix.test.ts`        | Coverage-matrix drift verifier    | Covers false-positive, false-negative, in-sync, matrix-edit regression, and parser edge cases.                                                                                 |
| `scripts/redact.test.ts`                        | Redaction CLI                     | Runs the real stdin/stdout subprocess path for `scripts/redact.ts`.                                                                                                            |
| `scripts/patch-playwright-yauzl-node26.test.ts` | Node 26 Playwright patch          | Verifies the postinstall patch for the vendored `yauzl` stream-destroy issue.                                                                                                  |

## Coverage Matrix

`coverage-matrix.json` is a manual test coverage matrix because this repository does not have access to the backend source. It lists known testable pages and forms with booleans for:

- `title`
- `content`
- `accessibility`
- `visualRegression`
- `api`
- `securityHeaders`
- `negativePath`
- `tracking`

`activePageCategories` controls which page categories count in summary math. `defaultApplicablePageCategories` defines ordinary-page defaults. `pageApplicableCategories` narrows or extends route-specific cases, such as tracker contract entries where only `tracking` applies.

When a new test covers a previously uncovered item, flip the matching value to `true`. When a new page or form is introduced, add it to the matrix so it appears as a gap until tests are written.

Run the drift verifier locally:

```bash
cd playwright/typescript
npm run verify:matrix
```
