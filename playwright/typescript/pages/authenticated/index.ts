import { InformationPage } from './information.page';
import { StatsPage } from './stats.page';
import { HitsPage } from './hits.page';
import { ScriptsPage } from './scripts.page';
import { AdminPage } from './admin.page';

export { InformationPage, StatsPage, HitsPage, ScriptsPage, AdminPage };

export const AUTHENTICATED_PAGE_CLASSES = [
  InformationPage,
  StatsPage,
  HitsPage,
  ScriptsPage,
  AdminPage,
] as const;
