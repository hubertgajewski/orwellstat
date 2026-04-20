import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class InformationPage extends AbstractPage {
  static readonly url = '/zone/';
  static readonly title = 'Orwell Stat - Informacje';
  static readonly accessKey = 'I';

  constructor(page: Page) {
    super(page, InformationPage.url, InformationPage.title, InformationPage.accessKey);
  }

  // The page has no <h1> text of its own (the h1 holds the site logo image); the first
  // real section heading is this h2.
  get heading() {
    return this.page.getByRole('heading', { name: 'Podstawowe informacje', exact: true });
  }

  // Shown when the signed-in account has no hits in the last 30 days.
  get emptyStateHeading() {
    return this.page.getByRole('heading', {
      name: 'W ciągu ostatnich 30 dni nie odnotowano żadnych odsłon na Twoich stronach',
      exact: true,
    });
  }

  // Populated-state section headings (rendered only when the account has hits).
  get visitFrequencyHeading() {
    return this.page.getByRole('heading', {
      name: 'Jak często są odwiedzane Twoje strony',
      exact: true,
    });
  }

  get rankingHeading() {
    return this.page.getByRole('heading', { name: 'Ranking popularności', exact: true });
  }

  // Populated-state content markers. Each section is inline prose — not a <table> — with
  // <span class="bold"> values. We assert the stable labels that always appear with data.
  get todayCount() {
    return this.page.getByText('Dzisiaj:', { exact: false });
  }

  get topPage() {
    return this.page.getByText('Najpopularniejsza strona:', { exact: false });
  }
}
