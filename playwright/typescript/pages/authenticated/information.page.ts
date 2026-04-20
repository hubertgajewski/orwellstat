import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class InformationPage extends AbstractPage {
  static readonly url = '/zone/';
  static readonly title = 'Orwell Stat - Informacje';
  static readonly accessKey = 'I';

  // The page has no <h1> text of its own (the h1 holds the site logo image); the first
  // real section heading is this h2.
  static readonly pageHeading = 'Podstawowe informacje';
  // Shown when the signed-in account has no hits in the last 30 days.
  static readonly emptyState =
    'W ciągu ostatnich 30 dni nie odnotowano żadnych odsłon na Twoich stronach';
  // Populated-state section headings (rendered only when the account has hits).
  static readonly visitFrequency = 'Jak często są odwiedzane Twoje strony';
  static readonly ranking = 'Ranking popularności';

  // Populated-state content markers. Each section is inline prose — not a <table> — with
  // <span class="bold"> values. We assert the stable labels that always appear with data.
  static readonly todayLabel = 'Dzisiaj:';
  static readonly topPageLabel = 'Najpopularniejsza strona:';

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

  get todayCount() {
    return this.page.getByText(InformationPage.todayLabel, { exact: false });
  }

  get topPage() {
    return this.page.getByText(InformationPage.topPageLabel, { exact: false });
  }
}
