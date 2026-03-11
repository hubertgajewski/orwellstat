import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class AdminPage extends AbstractPage {
  static readonly url = '/zone/admin/';
  static readonly title = 'Orwell Stat - Administracja';
  static readonly accessKey = 'A';

  constructor(page: Page) {
    super(page, AdminPage.url, AdminPage.title, AdminPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', {
      name: 'Administracja',
      exact: true,
    });
  }
}
