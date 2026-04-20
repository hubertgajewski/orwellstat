import { expect, type APIRequestContext } from '@playwright/test';
import { test as base } from '@fixtures/base.fixture';
import { requireCredentials, type Account } from '@utils/env.util';

type ApiOptions = {
  // Which account `authenticatedRequest` logs in as. Override per file or describe with
  // `test.use({ authAccount: 'empty' })`; default is the filled account to match the
  // browser-project `storageState` default. Never branch at runtime — see the
  // **Fixture usage** bullet in `.claude/skills/deep-review/SKILL.md`.
  authAccount: Account;
};

type ApiFixtures = {
  authenticatedRequest: APIRequestContext;
  unauthenticatedRequest: APIRequestContext;
};

export const test = base.extend<ApiOptions & ApiFixtures>({
  authAccount: ['filled', { option: true }],

  unauthenticatedRequest: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL });
    await use(ctx);
    await ctx.dispose();
  },

  authenticatedRequest: async ({ request, authAccount }, use) => {
    const { user, password } = requireCredentials(authAccount);
    const response = await request.post('/zone/', {
      form: {
        username: user,
        password: password,
      },
    });
    expect(response.status()).toBe(200);
    await use(request);
  },
});

export { expect, type APIRequestContext } from '@fixtures/base.fixture';
