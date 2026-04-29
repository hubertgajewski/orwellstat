import { type Locator, type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';
import { NEWS, NEW_BROWSERS, NEW_OSES } from '@pages/common';

export class PreviouslyAddedPage extends AbstractPage {
  static readonly url = '/2/';
  static readonly title = 'Orwell Stat - Poprzednio dodane przeglądarki i systemy';

  static readonly news = NEWS;
  static readonly newBrowsers = NEW_BROWSERS;
  static readonly newOSes = NEW_OSES;

  static readonly previousBrowsersSection = 'Poprzednio dodane przeglądarki i inne aplikacje WWW';
  static readonly previousOsesSection = 'Poprzednio dodane systemy operacyjne';
  static readonly allBrowsersLink = 'wszystkich obsługiwanych przeglądarek i innych aplikacji WWW';
  static readonly allOsesLink = 'wszystkich obsługiwanych systemów operacyjnych';
  static readonly recentlyAddedLink = 'ostatnio dodanych';

  constructor(page: Page) {
    super(page, PreviouslyAddedPage.url, PreviouslyAddedPage.title);
  }

  // /2/ renders no `<h*>` element with the "Poprzednio dodane" section text —
  // those strings are body text only, following the `<h3>Obsługa nowych...</h3>`
  // sub-headings. Every heading on /2/ (Logowanie do serwisu, Nowości, the two
  // `<h3>Obsługa nowych...</h3>` sub-headings) is shared with `/`, so no truly
  // page-specific heading exists. Expose `Nowości` — the first content `<h2>`,
  // headlining the section that contains all of /2/'s content — so the abstract
  // `heading: Locator` contract resolves to a real heading; same pattern as
  // `HitsPage` and `AdminPage`.
  get heading(): Locator {
    return this.page.getByRole('heading', { name: PreviouslyAddedPage.news, exact: true });
  }
}
