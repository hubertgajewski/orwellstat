import { type Locator, type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class RegisterPage extends AbstractPage {
  static readonly url = '/register/';
  static readonly title = 'Orwell Stat - Rejestracja nowego użytkownika';
  static readonly headingText = 'Rejestracja';
  static readonly fieldsetLegend = 'Dane potrzebne do rejestracji';
  static readonly submitLabel = 'Rejestruj';
  static readonly loginNavLabel = 'Logowanie';

  constructor(page: Page) {
    super(page, RegisterPage.url, RegisterPage.title);
  }

  // The h2 on /register/ renders "Rejestracja" — the longer string
  // "Rejestracja nowego użytkownika" is only the document <title>. The
  // previous literal "Rejestrowanie użytkownika" never appeared on the page;
  // it slipped through because the only spec was a `test.fixme` stub
  // (same root cause documented in pages/authenticated/admin.page.ts:22).
  get heading(): Locator {
    return this.page.getByRole('heading', { name: RegisterPage.headingText, exact: true });
  }

  // Scope every registration-form getter to the <fieldset> whose <legend> is
  // "Dane potrzebne do rejestracji". The /register/ page also renders a login
  // form (#username, #password) in the sidebar; without scoping, ID locators
  // for any future shared name risk picking up the wrong control. ARIA
  // exposes fieldset+legend as role=group with the legend as accessible name.
  get registrationForm(): Locator {
    return this.page.getByRole('group', { name: RegisterPage.fieldsetLegend, exact: true });
  }

  // ID-based locators (XHTML breaks Playwright's `getByLabel` and
  // `toHaveValue` on lowercase XML nodeNames — same root cause as
  // pages/authenticated/admin.page.ts:42).
  get usernameField(): Locator {
    return this.registrationForm.locator('#newuser');
  }

  get passwordField(): Locator {
    return this.registrationForm.locator('#newpassword');
  }

  get confirmPasswordField(): Locator {
    return this.registrationForm.locator('#newpassword2');
  }

  get emailField(): Locator {
    return this.registrationForm.locator('#email');
  }

  get submitButton(): Locator {
    return this.registrationForm.getByRole('button', {
      name: RegisterPage.submitLabel,
      exact: true,
    });
  }

  // The unique nav link back to the login form's anchor on this page.
  // "Strona główna" appears twice (top nav + footer) and would trip strict
  // mode without a `.first()` workaround; "Logowanie" appears exactly once.
  get loginNavLink(): Locator {
    return this.page.getByRole('link', { name: RegisterPage.loginNavLabel, exact: true });
  }
}
