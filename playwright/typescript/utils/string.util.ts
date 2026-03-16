import { type Page, expect } from '@fixtures/base.fixture';

export async function expectHeadings(page: Page, headings: string[]) {
  for (const heading of headings) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
}
