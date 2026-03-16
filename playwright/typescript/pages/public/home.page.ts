import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';
import { NEWS, NEW_BROWSERS, NEW_OSES } from '@pages/common';

export class HomePage extends AbstractPage {
  static readonly url = '/';
  static readonly title = 'Orwell Stat - Strona główna';
  static readonly accessKey = 'G';

  static readonly news = NEWS;
  static readonly newBrowsers = NEW_BROWSERS;
  static readonly newOSes = NEW_OSES;

  static readonly recentBrowsersSection = 'Ostatnio dodane przeglądarki i inne aplikacje WWW';
  static readonly recentOsesSection = 'Ostatnio dodane systemy operacyjne';
  static readonly allBrowsersLink = 'wszystkich obsługiwanych przeglądarek i innych aplikacji WWW';
  static readonly allOsesLink = 'wszystkich obsługiwanych systemów operacyjnych';
  static readonly previouslyAddedLink = 'poprzednio dodanych';
  static readonly recentlyAddedLink = 'ostatnio dodanych';

  static readonly styleSelector = 'Wybierz styl';
  static readonly stylePurpleRain = 'Purple Rain';

  constructor(page: Page) {
    super(page, HomePage.url, HomePage.title, HomePage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', {
      name: 'Strona główna',
      exact: true,
    });
  }
}
