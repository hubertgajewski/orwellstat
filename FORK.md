# Forking & adapting orwellstat to your own environment

This guide is for anyone forking the repo to run the test suite against their own deployment. For orwellstat-specific development, see [`README.md`](README.md).

## Adapting to your own environment

This repository is specific to Orwell Stat out of the box, but it can be adapted with moderate effort to a simple or moderately complex web application with similar page-driven flows. It is not intended as a drop-in framework for large, highly dynamic, or deeply domain-specific products.

### What you will need to change first

1. Base URLs

Update the target environments in [playwright.config.ts](./playwright/typescript/playwright.config.ts) and the Bruno environment files:

- [playwright.config.ts](./playwright/typescript/playwright.config.ts) — replace the `BASE_URLS` values
- [production.bru](./bruno/environments/production.bru) — replace `baseUrl`
- [staging.bru](./bruno/environments/staging.bru) — replace `baseUrl`

2. Authentication flow

If your app logs in differently, update:

- [auth.setup.ts](./playwright/typescript/auth.setup.ts) — UI login flow and post-login assertion
- [api.fixture.ts](./playwright/typescript/fixtures/api.fixture.ts) — API login request used by authenticated HTTP tests
- [.env.example](./.env.example) — rename or replace credential variables if your app uses different secrets

If your app does not require authentication, you can remove the authenticated fixtures, the setup project, and any tests that depend on `storageState`.

3. Page objects and routes

The fastest migration path is to keep the current Page Object Model structure and replace Orwell Stat pages one by one:

- [public index](./playwright/typescript/pages/public/index.ts) — defines the public page list used by data-driven tests
- [authenticated index](./playwright/typescript/pages/authenticated/index.ts) — defines the authenticated page list
- files under [playwright/typescript/pages/public](./playwright/typescript/pages/public)
- files under [playwright/typescript/pages/authenticated](./playwright/typescript/pages/authenticated)

For each page class, update:

- `url`
- `title`
- `heading`
- page-specific locators and text constants

4. Assertions tied to Orwell Stat content

Most adaptation work is in the spec files, because many assertions check Orwell Stat-specific headings, links, tables, and chart behavior:

- [tests/home.spec.ts](./playwright/typescript/tests/home.spec.ts)
- [tests/about-system.spec.ts](./playwright/typescript/tests/about-system.spec.ts)
- [tests/contact.spec.ts](./playwright/typescript/tests/contact.spec.ts)
- [tests/statistics.spec.ts](./playwright/typescript/tests/statistics.spec.ts)
- [tests/visual.spec.ts](./playwright/typescript/tests/visual.spec.ts)
- [tests/validation.spec.ts](./playwright/typescript/tests/validation.spec.ts)

The lowest-friction way to migrate is:

1. Make `api.spec.ts` and `navigation.spec.ts` pass first.
2. Update page objects until the smoke suite is green.
3. Port deeper regression tests page by page.
4. Regenerate visual baselines only after layout and selectors are stable.

5. Coverage matrix

Update [coverage-matrix.json](./playwright/typescript/coverage-matrix.json) so it reflects your pages and forms; otherwise the coverage workflow will report misleading results.

### Features you may want to disable during migration

These are useful for Orwell Stat, but optional for a fork:

- AI diagnosis in [diagnosis.util.ts](./playwright/typescript/utils/diagnosis.util.ts) if you do not want failed DOM snapshots sent to an external AI provider
- visual regression snapshots in [tests/visual.spec.ts](./playwright/typescript/tests/visual.spec.ts) until your UI is stable
- W3C validation checks in [tests/validation.spec.ts](./playwright/typescript/tests/validation.spec.ts) if your app is not XHTML/CSS-validator oriented
- self-hosted runner automation in [setup-runners.sh](./scripts/setup-runners.sh) if you do not need push-back workflows
- quality metrics and issue-label reporting if your repo does not use the same bug taxonomy

### Workflow adjustments usually needed in a fork

If you adapt this repository to another project, review the GitHub Actions files before relying on them unchanged.

The most common adjustments are:

- repository identity guards in files under [.github/workflows](./.github/workflows), such as `github.repository == 'hubertgajewski/orwellstat'`
- secret names and repository variables if your environment does not use `ORWELLSTAT_*`, `BASIC_AUTH_*`, `PLAYWRIGHT_TYPESCRIPT`, `BRUNO`, or `QUALITY_METRICS`
- push-back workflows that commit generated files or visual baselines back to the repository
- self-hosted runner configuration in [setup-runners.sh](./scripts/setup-runners.sh), which is currently hardcoded to this GitHub repository
- optional AI integrations such as AI diagnosis (Anthropic or Gemini) and PR review if you do not want external AI services in your pipeline

Review these files first:

- [playwright-typescript.yml](./.github/workflows/playwright-typescript.yml)
- [playwright-typescript-lint.yml](./.github/workflows/playwright-typescript-lint.yml)
- [bruno.yml](./.github/workflows/bruno.yml)
- [quality-metrics.yml](./.github/workflows/quality-metrics.yml)
- [update-visual-baselines.yml](./.github/workflows/update-visual-baselines.yml)
- [claude-code-review.yml](./.github/workflows/claude-code-review.yml)
- [setup-runners.sh](./scripts/setup-runners.sh)

### Recommended migration order

1. Replace base URLs and credentials.
2. Make the login flow work in `auth.setup.ts`.
3. Replace page classes and page lists.
4. Get smoke tests passing.
5. Port API, accessibility, and regression assertions.
6. Update `coverage-matrix.json`.
7. Adjust GitHub Actions secrets, variables, repository guards, and optional workflows.
8. Re-record visual baselines.

### Reusable parts of this repo

The most reusable pieces are:

- Playwright project structure and POM conventions
- failure attachments and debugging fixtures
- data-driven page loops from `PUBLIC_PAGE_CLASSES` / `AUTHENTICATED_PAGE_CLASSES`
- accessibility checks with Axe
- CI workflow structure for browser matrix runs
- Bruno collection layout for simple authenticated API checks

The least reusable parts are the exact selectors, copy, URLs, visual baselines, and assumptions about a relatively straightforward page structure.
