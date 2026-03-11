import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';
import { NEWS, NEW_BROWSERS, NEW_OSES } from '@pages/common';

export class PreviouslyAddedPage extends AbstractPage {
  static readonly url = '/2/';
  static readonly title =
    'Orwell Stat - Poprzednio dodane przeglądarki i systemy';

  static readonly news = NEWS;
  static readonly newBrowsers = NEW_BROWSERS;
  static readonly newOSes = NEW_OSES;

  static readonly previousBrowsersSection =
    'Poprzednio dodane przeglądarki i inne aplikacje WWW';
  static readonly previousOsesSection =
    'Poprzednio dodane systemy operacyjne';
  static readonly allBrowsersLink =
    'wszystkich obsługiwanych przeglądarek i innych aplikacji WWW';
  static readonly allOsesLink =
    'wszystkich obsługiwanych systemów operacyjnych';
  static readonly recentlyAddedLink = 'ostatnio dodanych';

  constructor(page: Page) {
    super(page, PreviouslyAddedPage.url, PreviouslyAddedPage.title);
  }

  get heading() {
    return this.page.getByText(
      'Poprzednio dodane przeglądarki i inne aplikacje WWW:'
    );
  }
}
