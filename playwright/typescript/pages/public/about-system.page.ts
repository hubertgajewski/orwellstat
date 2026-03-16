import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class AboutSystemPage extends AbstractPage {
  static readonly url = '/about/';
  static readonly title = 'Orwell Stat - O systemie';
  static readonly accessKey = 'T';

  static readonly whatIsOrwellStat = 'Co to jest Orwell Stat?';
  static readonly whatDataIsCollected = 'Jakie dane rejestruje system?';
  static readonly browsersAndApps = 'Przeglądarki i inne aplikacje WWW';
  static readonly operatingSystems = 'Systemy operacyjne';
  static readonly requirements = 'Wymagania';
  static readonly minimalRequirements = 'Minimalne wymagania do korzystania z serwisu';
  static readonly recommended = 'Zalecane';

  static readonly orwellStatIntro = 'Orwell Stat to system statystyk internetowych';
  static readonly wsbNlu = { name: 'WSB-NLU', href: 'http://wsb-nlu.edu.pl/' };
  static readonly hubertGajewski = {
    name: 'Hubert Gajewski',
    href: 'http://hubertgajewski.com/',
  };
  static readonly tomaszGorazd = {
    name: 'dr Tomasz Gorazd',
    href: 'http://tcs.uj.edu.pl/Gorazd',
  };

  static readonly browserCount = 'ponad 90';
  static readonly osCount = 'ponad 400';
  static readonly sampleBrowsers = ['Chrome', 'Firefox', 'Edge', 'Safari', 'Opera'] as const;
  static readonly sampleOSes = ['Linux', 'Windows', 'macOS', 'Android', 'iOS'] as const;

  static readonly screenshots = {
    links: {
      src: '/images/screenshots/links_small.jpg',
      alt: 'Zrzut ekranu użytkownika używającego przeglądarki Links 2.1',
    },
    firefoxIgs: {
      src: '/images/screenshots/firefox_igs_small.jpg',
      alt: 'Zrzut ekranu użytkownika używającego przeglądarki Firefox z ustawionym stylem Irish Green SVG',
    },
    firefoxPr: {
      src: '/images/screenshots/firefox_pr_small.jpg',
      alt: 'Zrzut ekranu użytkownika używającego przeglądarki Firefox z ustawionym stylem Purple Rain',
    },
    firefoxP: {
      src: '/images/screenshots/firefox_p_small.jpg',
      alt: 'Zrzut ekranu użytkownika używającego przeglądarki Firefox z ustawionym stylem Wersja do druku',
    },
  } as const;

  static readonly adobeSvgViewer = {
    name: 'Adobe SVG Viewer',
    href: 'http://www.adobe.com/svg/',
  };
  static readonly vgaRequirementText = 'rozdzielczość VGA (640x480 pikseli)';
  static readonly hdRequirementText = 'rozdzielczość 1024x768 pikseli';

  constructor(page: Page) {
    super(page, AboutSystemPage.url, AboutSystemPage.title, AboutSystemPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'O systemie', exact: true });
  }
}
