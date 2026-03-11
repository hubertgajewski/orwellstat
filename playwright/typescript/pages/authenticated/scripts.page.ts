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
}
