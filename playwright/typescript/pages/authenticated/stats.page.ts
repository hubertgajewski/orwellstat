import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class StatsPage extends AbstractPage {
  static readonly url = '/zone/stats/';
  static readonly title = 'Orwell Stat - Statystyki';
  static readonly accessKey = 'S';

  constructor(page: Page) {
    super(page, StatsPage.url, StatsPage.title, StatsPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Statystyki', exact: true });
  }
}
