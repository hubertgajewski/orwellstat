import { type Locator, type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class PasswordResetPage extends AbstractPage {
  static readonly url = '/password_reset/';
  static readonly title = 'Orwell Stat - Resetowanie hasła użytkownika';

  constructor(page: Page) {
    super(page, PasswordResetPage.url, PasswordResetPage.title);
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Resetowanie hasła', exact: true });
  }

  // Scope every form-control getter to the recovery `<fieldset>` whose `<legend>`
  // is "Dane potrzebne do zresetowania hasła". The page also renders the login
  // form below, which reuses `id="username"`; scoping by role=group (legend as
  // accessible name) keeps the recovery and login fields disambiguated even on
  // application/xhtml+xml where CSS form selectors flake.
  get recoveryForm(): Locator {
    return this.page.getByRole('group', {
      name: 'Dane potrzebne do zresetowania hasła',
      exact: true,
    });
  }

  get usernameField(): Locator {
    return this.recoveryForm.locator('#username');
  }

  get submitButton(): Locator {
    return this.recoveryForm.getByRole('button', { name: 'Resetuj hasło', exact: true });
  }

  get backToHomeLink(): Locator {
    return this.page.locator('#menubar').getByRole('link', { name: 'Strona główna', exact: true });
  }
}
