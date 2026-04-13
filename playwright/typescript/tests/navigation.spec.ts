import { test, expect } from '@fixtures/base.fixture';
import { expectHeadings } from '@utils/string.util';
import {
  AboutSystemPage,
  ContactPage,
  HomePage,
  PUBLIC_PAGE_CLASSES,
  ServiceStatisticsPage,
} from '@pages/public/index';
import { AUTHENTICATED_PAGE_CLASSES } from '@pages/authenticated/index';

for (const PageClass of PUBLIC_PAGE_CLASSES) {
  test(`${PageClass.url} has correct title`, { tag: '@smoke' }, async ({ page }) => {
    await page.goto(PageClass.url);
    await expect(page).toHaveTitle(PageClass.title);
  });
}

for (const PageClass of AUTHENTICATED_PAGE_CLASSES) {
  test(`${PageClass.url} has correct title`, { tag: '@smoke' }, async ({ page }) => {
    await page.goto(PageClass.url);
    await expect(page).toHaveTitle(PageClass.title);
  });
}

test.describe('navigation', { tag: '@smoke' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('home page', async ({ page }) => {
    await page
      .getByRole('link', { name: 'Strona główna', exact: true })
      .click();

    await expectHeadings(page, [
      HomePage.signIn,
      HomePage.news,
      HomePage.newBrowsers,
      HomePage.newOSes,
    ]);
  });

  test('about system', async ({ page }) => {
    await page.locator('#menubar').getByRole('link', { name: 'O systemie', exact: true }).click();

    await expectHeadings(page, [
      AboutSystemPage.signIn,
      AboutSystemPage.whatIsOrwellStat,
      AboutSystemPage.whatDataIsCollected,
      AboutSystemPage.browsersAndApps,
      AboutSystemPage.operatingSystems,
      AboutSystemPage.requirements,
      AboutSystemPage.minimalRequirements,
      AboutSystemPage.recommended,
    ]);
  });

  test('statistics', async ({ page }) => {
    await page
      .locator('#menubar')
      .getByRole('link', { name: 'Statystyki serwisu', exact: true })
      .click();

    await expectHeadings(page, [ServiceStatisticsPage.signIn, ServiceStatisticsPage.statistics]);
  });

  test('contact', async ({ page }) => {
    await page.locator('#menubar').getByRole('link', { name: 'Kontakt', exact: true }).click();

    await expectHeadings(page, [ContactPage.signIn, ContactPage.contact]);
  });
});
