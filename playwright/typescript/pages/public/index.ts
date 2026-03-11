import { HomePage } from './home.page';
import { AboutSystemPage } from './about-system.page';
import { ServiceStatisticsPage } from './service-statistics.page';
import { ContactPage } from './contact.page';
import { RegisterPage } from './register.page';
import { PasswordResetPage } from './password-reset.page';

export {
  HomePage,
  AboutSystemPage,
  ServiceStatisticsPage,
  ContactPage,
  RegisterPage,
  PasswordResetPage,
};

export const PUBLIC_PAGE_CLASSES = [
  HomePage,
  AboutSystemPage,
  ServiceStatisticsPage,
  ContactPage,
  RegisterPage,
  PasswordResetPage,
] as const;
