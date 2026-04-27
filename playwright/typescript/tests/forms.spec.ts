import { test } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';
import { AdminPage } from '@pages/authenticated/admin.page';

test.fixme('login form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to HomePage.url and verify the login form (fields, labels, submit button,
  // error state for invalid credentials).
  await page.goto(HomePage.url);
});

// hitsFilter form coverage lives in zone-hits.spec.ts (page-organised, mirroring
// zone-scripts.spec.ts). The verifier rule for forms["hitsFilter"] points there.

test.fixme('adminSettings form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to AdminPage.url and verify the admin settings form (fields, labels,
  // submit button, that saving a setting persists the value).
  await page.goto(AdminPage.url);
});
