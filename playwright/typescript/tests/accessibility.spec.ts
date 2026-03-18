import { test } from '@fixtures/base.fixture';
import { expectNoAccessibilityViolations } from '@utils/accessibility.util';
import { PUBLIC_PAGE_CLASSES } from '@pages/public/index';
import { AUTHENTICATED_PAGE_CLASSES } from '@pages/authenticated/index';

test.describe('accessibility', { tag: '@regression' }, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Accessibility tests run on Chromium only'
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
