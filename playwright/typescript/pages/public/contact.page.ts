import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class ContactPage extends AbstractPage {
  static readonly url = '/contact/';
  static readonly title = 'Orwell Stat - Kontakt';
  static readonly accessKey = 'K';

  static readonly contact = 'Kontakt';

  static readonly emailIntro = 'E-mail znajdziesz na stronie';
  static readonly contactLinkUrl = 'http://hubertgajewski.com/kontakt/';
  static readonly contactLinkTitle = 'Kontakt z Orwell Stat';

  constructor(page: Page) {
    super(page, ContactPage.url, ContactPage.title, ContactPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Kontakt', exact: true });
  }
}
