import { type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';
import { PARAMETER_OPTIONS, type ParameterOption } from '@pages/public/service-statistics.page';

// Six per-user-only Parametr dimensions that exist on `/zone/stats/` but NOT on the public
// `/statistics/` page. They cover identifying or session-specific data the aggregate page
// cannot show (visited URLs, IPs, user agents, referrers, host names, color depth).
export const USER_ONLY_PARAMETER_OPTIONS: readonly ParameterOption[] = [
  { value: 'glebia', label: 'Głębia barw' },
  { value: 'strona', label: 'Odwiedzana strona', chartLabelIsRank: true },
  { value: 'odsylacz', label: 'Strona odsyłająca', chartLabelIsRank: true },
  { value: 'ip', label: 'Adres IP' },
  { value: 'host', label: 'Nazwa hosta', chartLabelIsRank: true },
  { value: 'http_user_agent', label: 'User-Agent', chartLabelIsRank: true },
] as const;

// Full Parametr option set rendered on `/zone/stats/`: the six shared dimensions (also on
// `/statistics/`) followed by the six user-only additions.
export const USER_PARAMETER_OPTIONS: readonly ParameterOption[] = [
  ...PARAMETER_OPTIONS,
  ...USER_ONLY_PARAMETER_OPTIONS,
];

export class StatsPage extends AbstractPage {
  static readonly url = '/zone/stats/';
  static readonly title = 'Orwell Stat - Statystyki';
  static readonly accessKey = 'S';

  static readonly statistics = 'Statystyki Twojego użytkownika Orwell Stat';
  static readonly parameterLabel = 'Parametr';
  static readonly periodLabel = 'Okres';
  static readonly showStatisticsSubmitLabel = 'Pokaż statystyki';
  static readonly colLp = 'Lp.';
  static readonly colBrowsers = 'Przeglądarki i inne aplikacje WWW';
  static readonly colCount = '#';
  static readonly colPercent = '%';

  static readonly totalRecognized = 'Łącznie rozpoznane';
  static readonly unrecognized = 'Nierozpoznane';
  static readonly total = 'Łącznie';

  // Per-user chart endpoint (vs `chart_all.php` on the public /statistics/ page).
  static readonly svgChartUrl = 'chart.php';
  static readonly svgChartPreAuthUrl = `/libs/${StatsPage.svgChartUrl}`;

  constructor(page: Page) {
    super(page, StatsPage.url, StatsPage.title, StatsPage.accessKey);
  }

  get heading() {
    return this.page.getByRole('heading', { name: StatsPage.statistics, exact: true });
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
