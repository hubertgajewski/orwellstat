import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

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
}
