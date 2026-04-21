import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class ScriptsPage extends AbstractPage {
  static readonly url = '/zone/scripts/';
  static readonly title = 'Orwell Stat - Skrypty';
  static readonly accessKey = 'R';

  constructor(page: Page) {
    super(page, ScriptsPage.url, ScriptsPage.title, ScriptsPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Skrypty', exact: true });
  }

  get html5SectionHeading() {
    return this.page.getByRole('heading', {
      name: 'Pliki text/html zawierające HTML5',
      exact: true,
    });
  }

  get html4SectionHeading() {
    return this.page.getByRole('heading', {
      name: 'Pliki text/html zawierające HTML4 lub XHTML',
      exact: true,
    });
  }

  get xhtmlSectionHeading() {
    return this.page.getByRole('heading', {
      name: 'Pliki application/xhtml+xml (XHTML)',
      exact: true,
    });
  }

  // The three server-rendered snippet textareas are in the same DOM order as their
  // section headings above, so nth() indexing is safe and avoids pinning a fragile
  // name/id that the product could rename.
  get html5Snippet() {
    return this.page.locator('textarea').nth(0);
  }

  get html4Snippet() {
    return this.page.locator('textarea').nth(1);
  }

  get xhtmlSnippet() {
    return this.page.locator('textarea').nth(2);
  }
}
