import { test, expect } from '@fixtures/base.fixture';
import { PUBLIC_PAGE_CLASSES } from '@pages/public/index';
import { AUTHENTICATED_PAGE_CLASSES } from '@pages/authenticated/index';

test('public pages without authentication', async ({ unauthenticatedRequest }) => {
  const responses = await Promise.all(
    PUBLIC_PAGE_CLASSES.map((PageClass) => unauthenticatedRequest.get(PageClass.url))
  );
  for (const response of responses) {
    expect(response.status()).toBe(200);
  }
});

test('public pages with authentication', async ({ authenticatedRequest }) => {
  const responses = await Promise.all(
    PUBLIC_PAGE_CLASSES.map((PageClass) => authenticatedRequest.get(PageClass.url))
  );
  for (const response of responses) {
    expect(response.status()).toBe(200);
  }
});

test('authenticated pages', async ({ authenticatedRequest }) => {
  const responses = await Promise.all(
    AUTHENTICATED_PAGE_CLASSES.map((PageClass) => authenticatedRequest.get(PageClass.url))
  );
  for (const response of responses) {
    expect(response.status()).toBe(200);
  }
});

test('failed authentication', async ({ request }) => {
  const response = await request.post('/zone/', {
    form: {
      username: 'test',
      password: 'test',
      option: 'login',
    },
  });
  expect(response.status()).toBe(401);
});
