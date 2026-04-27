import { type Locator, type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class AdminPage extends AbstractPage {
  static readonly url = '/zone/admin/';
  static readonly title = 'Orwell Stat - Administracja';
  static readonly accessKey = 'A';
  // Single submit button for the entire profile form, labelled "Zmień". Server-side
  // validation short-circuits the underlying profile UPDATE if either email or
  // password validation fails — wrong-password, mismatched-new-passwords and
  // example@example.com submissions are therefore non-mutating and safe to run on
  // the shared populated account in parallel across browsers.
  static readonly submitLabel = 'Zmień';

  constructor(page: Page) {
    super(page, AdminPage.url, AdminPage.title, AdminPage.accessKey);
  }

  // The page renders no `<h2>Administracja</h2>` — that string is only the
  // <title>. The first content heading is "Twoje dane" (legend of the settings
  // fieldset is identical, but the AX tree exposes the `<h2>` separately as a
  // heading). The previous AdminPage.heading getter pointed at "Administracja"
  // but no active test exercised it (only a `test.fixme` stub), so the mismatch
  // went unnoticed until this issue's coverage was added.
  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Twoje dane', exact: true });
  }

  // Scope every form-control getter to the `<fieldset>` whose `<legend>` is "Twoje
  // dane", so the locators can never be confused with the page-wide logout form or the
  // style-selector form that share the layout. ARIA exposes a fieldset+legend as
  // role=group with the legend as accessible name — semantic and stable on this
  // application/xhtml+xml page where CSS form selectors flake.
  get settingsForm(): Locator {
    return this.page.getByRole('group', { name: 'Twoje dane', exact: true });
  }

  // ID-based locators for every form input. XHTML breaks Playwright's `getByLabel` and
  // `toHaveValue` (lowercase XML nodeNames fail strict checks); IDs are stable and
  // unambiguous on this page. Read field values via `toHaveJSProperty('value', …)`.
  get currentPasswordField(): Locator {
    return this.settingsForm.locator('#oldpassword');
  }

  get newPasswordField(): Locator {
    return this.settingsForm.locator('#newpassword');
  }

  get confirmPasswordField(): Locator {
    return this.settingsForm.locator('#newpassword2');
  }

  get emailField(): Locator {
    return this.settingsForm.locator('#email');
  }

  get blockIpField(): Locator {
    return this.settingsForm.locator('#block_ip');
  }

  get blockCookieRadioYes(): Locator {
    return this.settingsForm.locator('#tak');
  }

  get blockCookieRadioNo(): Locator {
    return this.settingsForm.locator('#nie');
  }

  get submitButton(): Locator {
    return this.settingsForm.getByRole('button', { name: AdminPage.submitLabel });
  }

  // SMS-tracking fields are server-rendered only for accounts on a private
  // username allowlist (the SMS-alert feature is enabled on a per-user basis).
  // The populated and empty test accounts are not on that list, so these
  // locators must resolve to count=0. They exist as getters so tests can assert
  // their absence rather than guessing which selector "wouldn't be there".
  get mobileField(): Locator {
    return this.settingsForm.locator('#mobile');
  }

  get ipToSmsField(): Locator {
    return this.settingsForm.locator('#ip_to_sms');
  }

  get hostToSmsField(): Locator {
    return this.settingsForm.locator('#host_to_sms');
  }

  // Form-status banner. The server renders the status message inside `<span
  // class="bold">` for both validation errors and the "Dane zostały zmienione"
  // success message, so a single locator covers every outcome. The form's
  // wrapping `<div class="text">` also contains a `<span class="bold">` for the
  // username inside the fieldset (`Nazwa użytkownika <span class="bold">…</span>`)
  // and a separate `div.text` further down the page renders the "Jesteś
  // zalogowany jako" username with the same markup — so we restrict to the
  // direct `span.bold` child of the form's div.text via `:scope >`, which
  // matches only the status banner the server emits immediately before the
  // `<form>` element.
  get statusMessage(): Locator {
    return this.page
      .locator('div.text')
      .filter({ has: this.settingsForm })
      .locator(':scope > span.bold');
  }
}
