import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class InformationPage extends AbstractPage {
  static readonly url = '/zone/';
  static readonly title = 'Orwell Stat - Informacje';
  static readonly accessKey = 'I';

  // The page has no <h1> text of its own (the h1 holds the site logo image); the first
  // real section heading is this h2. Upstream renders 'Postawowe' — a typo for 'Podstawowe';
  // match the DOM verbatim.
  static readonly pageHeading = 'Postawowe informacje';
  // Shown when the signed-in account has no hits in the last 30 days.
  static readonly emptyState =
    'W ciągu ostatnich 30 dni nie odnotowano żadnych odsłon na Twoich stronach';
  // Populated-state section headings.
  static readonly visitFrequency = 'Jak często są odwiedzane Twoje strony';
  static readonly ranking = 'Ranking popularności';

  constructor(page: Page) {
    super(page, InformationPage.url, InformationPage.title, InformationPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: InformationPage.pageHeading, exact: true });
  }

  get emptyStateHeading() {
    return this.page.getByRole('heading', { name: InformationPage.emptyState, exact: true });
  }

  get visitFrequencyHeading() {
    return this.page.getByRole('heading', { name: InformationPage.visitFrequency, exact: true });
  }

  get rankingHeading() {
    return this.page.getByRole('heading', { name: InformationPage.ranking, exact: true });
  }

  // Populated-state tables, positional within the page. Visit-frequency renders first and
  // ranking second; the empty-state DOM contains no tables. Callers must assert the table
  // count before using these.
  get visitFrequencyTable() {
    return this.page.getByRole('table').nth(0);
  }

  get rankingTable() {
    return this.page.getByRole('table').nth(1);
  }
}
