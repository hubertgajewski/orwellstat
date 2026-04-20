// Paths to the per-account Playwright storage-state files produced by `auth.setup.ts`.
// Tests default to the populated account via `playwright.config.ts`; empty-state tests opt
// in at file or describe scope via `test.use({ storageState: EMPTY_STORAGE_STATE })`.
// Never branch at runtime on which account is logged in — see the **Fixture usage** bullet
// in `.claude/skills/deep-review/SKILL.md`.

export const POPULATED_STORAGE_STATE = new URL('../.auth/populated.json', import.meta.url).pathname;
export const EMPTY_STORAGE_STATE = new URL('../.auth/empty.json', import.meta.url).pathname;
