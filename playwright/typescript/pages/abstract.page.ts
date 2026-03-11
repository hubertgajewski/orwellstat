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

  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  abstract get heading(): Locator;
}
