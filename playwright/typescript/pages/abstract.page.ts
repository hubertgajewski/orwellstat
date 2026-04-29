import { type Page, type Locator } from '@fixtures/base.fixture';
import { type BasePage } from '@pages/base.page';

export abstract class AbstractPage implements BasePage {
  static readonly signIn = 'Logowanie do serwisu';
  static readonly loggedInAs = 'Jesteś zalogowany jako';
  static readonly logoutButton = 'Wyloguj';

  constructor(
    protected page: Page,
    readonly url: string,
    readonly title: string,
    readonly accessKey?: string
  ) {}

  // Server emits `<…>Jesteś zalogowany jako <span class="bold">USER</span></…>`
  // inside #statsbar. Anchor on #statsbar (ID locator → XHTML-safe per project
  // convention) and narrow via the "Jesteś zalogowany jako" label, because
  // <span class="bold"> markup is reused elsewhere (e.g. inside the admin form
  // fieldsets — see admin.page.ts:97).
  static loggedInUsername(page: Page): Locator {
    return page.locator('#statsbar').getByText(this.loggedInAs).locator('span.bold');
  }

  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  abstract get heading(): Locator;
}
