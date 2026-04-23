import { test, expect } from '@fixtures/api.fixture';
import { PUBLIC_PAGE_CLASSES } from '@pages/public/index';
import { AUTHENTICATED_PAGE_CLASSES } from '@pages/authenticated/index';

test(
  'public pages without authentication',
  { tag: '@smoke' },
  async ({ unauthenticatedRequest }) => {
    const responses = await Promise.all(
      PUBLIC_PAGE_CLASSES.map((PageClass) => unauthenticatedRequest.get(PageClass.url))
    );
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  }
);

test('public pages with authentication', { tag: '@smoke' }, async ({ authenticatedRequest }) => {
  const responses = await Promise.all(
    PUBLIC_PAGE_CLASSES.map((PageClass) => authenticatedRequest.get(PageClass.url))
  );
  for (const response of responses) {
    expect(response.status()).toBe(200);
  }
});

test('authenticated pages', { tag: '@smoke' }, async ({ authenticatedRequest }) => {
  const responses = await Promise.all(
    AUTHENTICATED_PAGE_CLASSES.map((PageClass) => authenticatedRequest.get(PageClass.url))
  );
  for (const response of responses) {
    expect(response.status()).toBe(200);
  }
});

test('failed authentication', { tag: '@smoke' }, async ({ unauthenticatedRequest }) => {
  const loginPage = await unauthenticatedRequest.get('/zone/');
  expect(loginPage.status()).toBe(200);
  const match = (await loginPage.text()).match(/name="_csrf"\s+value="([^"]+)"/);
  if (!match) throw new Error('login form did not render a _csrf hidden input');
  const response = await unauthenticatedRequest.post('/zone/', {
    form: {
      username: 'test',
      password: 'test',
      option: 'login',
      _csrf: match[1],
    },
  });
  expect(response.status()).toBe(401);
});

test(
  'login POST without CSRF token is rejected',
  { tag: '@smoke' },
  async ({ unauthenticatedRequest }) => {
    const response = await unauthenticatedRequest.post('/zone/', {
      form: {
        username: 'test',
        password: 'test',
        option: 'login',
      },
    });
    expect(response.status()).toBe(403);
  }
);

test(
  'login POST with invalid CSRF token is rejected',
  { tag: '@smoke' },
  async ({ unauthenticatedRequest }) => {
    // GET first so the session holds a real token; the POST then submits a wrong one.
    await unauthenticatedRequest.get('/zone/');
    const response = await unauthenticatedRequest.post('/zone/', {
      form: {
        username: 'test',
        password: 'test',
        option: 'login',
        _csrf: 'deadbeef',
      },
    });
    expect(response.status()).toBe(403);
  }
);
