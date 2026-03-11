import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class RegisterPage extends AbstractPage {
  static readonly url = '/register/';
  static readonly title = 'Orwell Stat - Rejestracja nowego użytkownika';

  constructor(page: Page) {
    super(page, RegisterPage.url, RegisterPage.title);
  }

  get heading() {
    return this.page.getByRole('heading', {
      name: 'Rejestrowanie użytkownika',
      exact: true,
    });
  }
}
