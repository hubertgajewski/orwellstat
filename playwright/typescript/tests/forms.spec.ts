import { test } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public/home.page';

test.fixme('login form', { tag: '@regression' }, async ({ page }) => {
  // TODO: Navigate to HomePage.url and verify the login form (fields, labels, submit button,
  // error state for invalid credentials).
  await page.goto(HomePage.url);
});

// hitsFilter form coverage lives in zone-hits.spec.ts (page-organised, mirroring
// zone-scripts.spec.ts). The verifier rule for forms["hitsFilter"] points there.
//
// adminSettings form coverage lives in zone-admin.spec.ts under the "admin page -
// settings form" describe block. The verifier rule for forms["adminSettings"] points
// there.
