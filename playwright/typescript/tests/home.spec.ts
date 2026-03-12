import { test, expect } from '@fixtures/base.fixture';
import { HomePage } from '@pages/public';
import { PreviouslyAddedPage } from '@pages/public/previously-added.page';
import { expectHeadings } from '@utils/string.util';

test('home page', async ({ page }) => {
  await page.goto(HomePage.url);

  const previouslyAddedLinks = page.getByRole('link', {
    name: HomePage.previouslyAddedLink,
    exact: true,
  });
  const recentlyAddedLinks = page.getByRole('link', {
    name: PreviouslyAddedPage.recentlyAddedLink,
    exact: true,
  });
  const allBrowsersLink = page.getByRole('link', {
    name: HomePage.allBrowsersLink,
    exact: true,
  });
  const allOsesLink = page.getByRole('link', {
    name: HomePage.allOsesLink,
    exact: true,
  });
  const previouslyAddedPage = new PreviouslyAddedPage(page);

  // Home page – headings and section labels
  await expectHeadings(page, [
    HomePage.signIn,
    HomePage.news,
    HomePage.newBrowsers,
    HomePage.newOSes,
  ]);

  await expect(
    page.getByText(HomePage.recentBrowsersSection)
  ).toBeVisible();

  await expect(allBrowsersLink.first()).toBeVisible();

  await expect(page.getByText(HomePage.recentOsesSection)).toBeVisible();

  await expect(allOsesLink.first()).toBeVisible();

  await expect(previouslyAddedLinks).toHaveCount(2);
  await expect(previouslyAddedLinks.first()).toBeVisible();
  await expect(previouslyAddedLinks.nth(1)).toBeVisible();

  // Navigate to PreviouslyAdded via first link, verify page and sections
  await previouslyAddedLinks.first().click();
  await expect(page).toHaveTitle(PreviouslyAddedPage.title);
  await expect(previouslyAddedPage.heading).toBeVisible();

  await expectHeadings(page, [
    PreviouslyAddedPage.signIn,
    PreviouslyAddedPage.news,
    PreviouslyAddedPage.newBrowsers,
    PreviouslyAddedPage.newOSes,
  ]);

  await expect(
    page.getByText(PreviouslyAddedPage.previousBrowsersSection)
  ).toBeVisible();

  await expect(allBrowsersLink.first()).toBeVisible();

  await expect(
    page.getByText(PreviouslyAddedPage.previousOsesSection)
  ).toBeVisible();

  await expect(allOsesLink.first()).toBeVisible();

  await expect(recentlyAddedLinks).toHaveCount(2);
  await expect(recentlyAddedLinks.first()).toBeVisible();
  await expect(recentlyAddedLinks.nth(1)).toBeVisible();

  // Navigate back to Home via first "recently added" link
  await recentlyAddedLinks.first().click();
  await expect(page).toHaveTitle(HomePage.title);

  // Navigate to PreviouslyAdded via second link, verify page and sections
  await expect(previouslyAddedLinks).toHaveCount(2);
  await previouslyAddedLinks.nth(1).click();
  await expect(page).toHaveTitle(PreviouslyAddedPage.title);
  await expect(previouslyAddedPage.heading).toBeVisible();

  await expectHeadings(page, [
    HomePage.signIn,
    HomePage.news,
    HomePage.newBrowsers,
    HomePage.newOSes,
  ]);

  await expect(
    page.getByText(PreviouslyAddedPage.previousBrowsersSection)
  ).toBeVisible();

  await expect(allBrowsersLink.first()).toBeVisible();

  await expect(
    page.getByText(PreviouslyAddedPage.previousOsesSection)
  ).toBeVisible();

  await expect(allOsesLink.first()).toBeVisible();

  await expect(recentlyAddedLinks).toHaveCount(2);
  await expect(recentlyAddedLinks.first()).toBeVisible();
  await expect(recentlyAddedLinks.nth(1)).toBeVisible();

  // Navigate back to Home via second "recently added" link
  await recentlyAddedLinks.nth(1).click();
  await expect(page).toHaveTitle(HomePage.title);
});
