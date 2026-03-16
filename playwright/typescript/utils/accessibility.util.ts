import { type Page, expect } from '@fixtures/base.fixture';
import AxeBuilder from '@axe-core/playwright';

/**
 * Runs an Axe accessibility audit on the provided Playwright page and assert
 * that there are no WCAG2AAA violations.
 */
export async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2aaa']).analyze();
  expect(results.violations).toEqual([]);
}
