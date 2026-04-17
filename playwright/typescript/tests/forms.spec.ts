import { test } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';
import { HitsPage } from '@pages/authenticated/hits.page';
import { AdminPage } from '@pages/authenticated/admin.page';

test.fixme('login form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to HomePage.url and verify the login form (fields, labels, submit button,
  // error state for invalid credentials).
  await page.goto(HomePage.url);
});

test.fixme('hitsFilter form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to HitsPage.url and verify the hits filter form (fields, labels, submit
  // button, that applying a filter updates the page content).
  await page.goto(HitsPage.url);
});

test.fixme('adminSettings form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to AdminPage.url and verify the admin settings form (fields, labels,
  // submit button, that saving a setting persists the value).
  await page.goto(AdminPage.url);
});
