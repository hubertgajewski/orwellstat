import { Locator } from '@fixtures/base.fixture';

export interface BasePage {
  url: string;
  title: string;
  goto(): Promise<void>;
  heading: Locator;
  accessKey?: string;
}
