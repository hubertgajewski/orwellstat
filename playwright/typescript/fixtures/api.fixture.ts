import { expect, type APIRequestContext } from '@playwright/test';
import { test as base } from '@fixtures/base.fixture';
import { requireCredentials } from '@utils/env.util';

type ApiFixtures = {
  authenticatedRequest: APIRequestContext;
  unauthenticatedRequest: APIRequestContext;
};

export const test = base.extend<ApiFixtures>({
  unauthenticatedRequest: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL });
    await use(ctx);
    await ctx.dispose();
  },

  authenticatedRequest: async ({ request }, use) => {
    const { user, password } = requireCredentials();
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
