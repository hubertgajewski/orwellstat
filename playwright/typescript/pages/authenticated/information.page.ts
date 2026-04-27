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

  // Each ranking line renders as inline prose: `<label> <span class="bold">value</span> - NN.NN%
  //                  (NNN)<br />` — note the literal newlines + tabs between `%` and `(NNN)` in
  // the source. Playwright's regex matcher does not normalize whitespace, so `\s+` is required
  // wherever the source can span lines. Asserting label-only would silently pass on an empty
  // `<span>`, so the regex pins all four parts: label, non-empty value, percentage, count.
  private rankingLine(label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.page.getByText(
      new RegExp(`${escaped}\\s*\\S.*\\s+-\\s+\\d+\\.\\d+%\\s+\\(\\d+\\)`)
    );
  }

  get visitFrequencyLine() {
    return this.page.getByText(/Dzisiaj:\s*\d+,\s*w ciągu ostatnich 30 dni:\s*\d+\./);
  }

  get topHostLine() {
    return this.rankingLine('Najczęściej z hosta:');
  }

  get peakDayLine() {
    return this.rankingLine('Najwięcej odsłon dnia:');
  }

  get topBrowserLine() {
    return this.rankingLine('Najpopularniejsza przeglądarka:');
  }

  get topOsLine() {
    return this.rankingLine('Najpopularniejszy system operacyjny:');
  }

  get topLanguageLine() {
    return this.rankingLine('Najczęściej używany język:');
  }

  get topCountryLine() {
    return this.rankingLine('Najczęściej z kraju:');
  }

  get topPageLine() {
    return this.rankingLine('Najpopularniejsza strona:');
  }

  get topResolutionLine() {
    return this.rankingLine('Najczęściej ustawiona rozdzielczość ekranu:');
  }

  get topColorDepthLine() {
    return this.rankingLine('Najczęściej spotykana liczba kolorów:');
  }

  get footerNote() {
    return this.page.getByText('Prezentowane dane dotyczą ostatnich 30 dni.', { exact: true });
  }

  // In the `Najwięcej odsłon dnia:` line the link is rendered on the word `odsłon`
  // pointing at `/zone/hits/` — the date itself is plain text inside `<span class="bold">`.
  get peakDayLink() {
    return this.page.getByRole('link', { name: 'odsłon', exact: true });
  }
}
