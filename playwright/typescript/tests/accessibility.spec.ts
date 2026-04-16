import { test } from '@fixtures/base.fixture';
import { expectNoAccessibilityViolations } from '@utils/accessibility.util';
import { PUBLIC_PAGE_CLASSES } from '@pages/public/index';
import { AUTHENTICATED_PAGE_CLASSES } from '@pages/authenticated/index';

test.describe('accessibility', { tag: '@regression' }, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Chromium-only: axe-core analyzes the DOM tree, so results are engine-independent. Running on other browsers burns CI minutes for zero added signal.'
  );

  for (const PageClass of PUBLIC_PAGE_CLASSES) {
    test(PageClass.url, async ({ page }) => {
      await page.goto(PageClass.url);
      await expectNoAccessibilityViolations(page);
    });
  }

  for (const PageClass of AUTHENTICATED_PAGE_CLASSES) {
    test(PageClass.url, async ({ page }) => {
      await page.goto(PageClass.url);
      await expectNoAccessibilityViolations(page);
    });
  }
});
