import { expect, type APIRequestContext } from '@playwright/test';
import { test as base } from '@fixtures/base.fixture';

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

  // `request` inherits the project's populated `storageState` from
  // `playwright.config.ts`. Assert the session reaches an authenticated view
  // before yielding so callers fail fast if the seeded cookie is stale.
  authenticatedRequest: async ({ request }, use) => {
    const response = await request.get('/zone/');
    expect(response.status()).toBe(200);
    await use(request);
  },
});

export { expect, type APIRequestContext } from '@fixtures/base.fixture';
