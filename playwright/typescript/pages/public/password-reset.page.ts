import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class PasswordResetPage extends AbstractPage {
  static readonly url = '/password_reset/';
  static readonly title = 'Orwell Stat - Resetowanie hasła użytkownika';

  constructor(page: Page) {
    super(page, PasswordResetPage.url, PasswordResetPage.title);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Reset hasła', exact: true });
  }
}
