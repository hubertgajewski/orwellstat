import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export interface ParameterOption {
  readonly value: string;
  readonly label: string;
}

// "Pokaż statystyki" combobox options as rendered by /statistics/ and /zone/stats/.
// Both pages drive the same underlying server query, so the option set is shared.
export const PARAMETER_OPTIONS: readonly ParameterOption[] = [
  { value: 'przegladarka', label: 'Przeglądarki i inne aplikacje WWW' },
  { value: 'system', label: 'Systemy operacyjne' },
  { value: 'jezyk', label: 'Język przeglądarek' },
  { value: 'kraj', label: 'Kraj' },
  { value: 'rozdzielczosc', label: 'Rozdzielczość ekranu' },
  { value: 'kolory', label: 'Liczba kolorów' },
] as const;

export class ServiceStatisticsPage extends AbstractPage {
  static readonly url = '/statistics/';
  static readonly title = 'Orwell Stat - Statystyki serwisu';
  static readonly accessKey = 'W';

  static readonly statistics = 'Statystyki wszystkich użytkowników Orwell Stat';
  static readonly parameterLabel = 'Parametr';
  static readonly periodLabel = 'Okres';
  static readonly showStatisticsSubmitLabel = 'Pokaż statystyki';
  static readonly colLp = 'Lp.';
  static readonly colBrowsers = 'Przeglądarki i inne aplikacje WWW';
  static readonly colCount = '#';
  static readonly colPercent = '%';

  static readonly svgChartUrl = 'chart_all.php';
  static readonly svgChartPreAuthUrl = `/libs/${ServiceStatisticsPage.svgChartUrl}`;
  static readonly totalRecognized = 'Łącznie rozpoznane';
  static readonly unrecognized = 'Nierozpoznane';
  static readonly total = 'Łącznie';

  constructor(page: Page) {
    super(
      page,
      ServiceStatisticsPage.url,
      ServiceStatisticsPage.title,
      ServiceStatisticsPage.accessKey
    );
  }

  get heading() {
    return this.page.getByRole('heading', {
      name: 'Statystyki serwisu',
      exact: true,
    });
  }

  get parameterCombobox() {
    return this.page.getByRole('combobox', {
      name: ServiceStatisticsPage.parameterLabel,
      exact: true,
    });
  }

  get showStatisticsSubmit() {
    return this.page.getByRole('button', {
      name: ServiceStatisticsPage.showStatisticsSubmitLabel,
      exact: true,
    });
  }
}
