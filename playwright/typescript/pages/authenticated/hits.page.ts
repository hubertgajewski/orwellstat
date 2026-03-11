import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class HitsPage extends AbstractPage {
  static readonly url = '/zone/hits/';
  static readonly title = 'Orwell Stat - Odsłony';
  static readonly accessKey = 'O';

  constructor(page: Page) {
    super(page, HitsPage.url, HitsPage.title, HitsPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Odsłony', exact: true });
  }
}
