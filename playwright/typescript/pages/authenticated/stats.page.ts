import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class StatsPage extends AbstractPage {
  static readonly url = '/zone/stats/';
  static readonly title = 'Orwell Stat - Statystyki';
  static readonly accessKey = 'S';

  static readonly parameterLabel = 'Parametr';
  static readonly showStatisticsSubmitLabel = 'Pokaż statystyki';

  // Per-user chart endpoint (vs `chart_all.php` on the public /statistics/ page).
  static readonly svgChartUrl = 'chart.php';
  static readonly svgChartPreAuthUrl = `/libs/${StatsPage.svgChartUrl}`;

  constructor(page: Page) {
    super(page, StatsPage.url, StatsPage.title, StatsPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Statystyki', exact: true });
  }

  get parameterCombobox() {
    return this.page.getByRole('combobox', {
      name: StatsPage.parameterLabel,
      exact: true,
    });
  }

  get showStatisticsSubmit() {
    return this.page.getByRole('button', {
      name: StatsPage.showStatisticsSubmitLabel,
      exact: true,
    });
  }
}
