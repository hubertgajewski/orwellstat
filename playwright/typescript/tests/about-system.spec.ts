import { test, expect } from '@fixtures/base.fixture';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { expectHeadings } from '@utils/string.util';

test('about system page - headings and statsbar content', async ({ page }) => {
  await page.goto(AboutSystemPage.url);

  const statsbar = page.locator('#statsbar');

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

  // Login section – authenticated state shows logout button
  await expect(
    statsbar.getByText(AboutSystemPage.loggedInAs, { exact: false })
  ).toBeVisible();
  await expect(
    statsbar.getByRole('button', { name: AboutSystemPage.logoutButton, exact: true })
  ).toBeVisible();

  // "Co to jest Orwell Stat?" – text and external links
  await expect(
    statsbar.getByText(AboutSystemPage.orwellStatIntro, { exact: false })
  ).toBeVisible();
  await expect(
    statsbar.getByRole('link', { name: AboutSystemPage.wsbNlu.name, exact: true })
  ).toHaveAttribute('href', AboutSystemPage.wsbNlu.href);
  await expect(
    statsbar.getByRole('link', { name: AboutSystemPage.hubertGajewski.name, exact: true })
  ).toHaveAttribute('href', AboutSystemPage.hubertGajewski.href);
  await expect(
    statsbar.getByRole('link', { name: AboutSystemPage.tomaszGorazd.name, exact: true })
  ).toHaveAttribute('href', AboutSystemPage.tomaszGorazd.href);

  // "Jakie dane rejestruje system?" – browser/OS counts
  await expect(
    statsbar.getByText(AboutSystemPage.browserCount, { exact: false })
  ).toBeVisible();
  await expect(
    statsbar.getByText(AboutSystemPage.osCount, { exact: false })
  ).toBeVisible();

  // Sample browser names in the list
  for (const browser of AboutSystemPage.sampleBrowsers) {
    await expect(
      statsbar.getByRole('listitem').filter({ hasText: browser }).first()
    ).toBeVisible();
  }

  // Sample OS names in the list
  for (const os of AboutSystemPage.sampleOSes) {
    await expect(
      statsbar.getByRole('listitem').filter({ hasText: os }).first()
    ).toBeVisible();
  }

  // "Wymagania" – images with alt text
  for (const screenshot of Object.values(AboutSystemPage.screenshots)) {
    await expect(
      statsbar.locator(`img[src="${screenshot.src}"]`)
    ).toHaveAttribute('alt', screenshot.alt);
  }

  // "Zalecane" section – Adobe SVG Viewer link
  await expect(
    statsbar.getByRole('link', { name: AboutSystemPage.adobeSvgViewer.name, exact: true })
  ).toHaveAttribute('href', AboutSystemPage.adobeSvgViewer.href);

  // Minimum requirements – key text fragments
  await expect(
    statsbar.getByText(AboutSystemPage.vgaRequirementText, { exact: false })
  ).toBeVisible();
  await expect(
    statsbar.getByText(AboutSystemPage.hdRequirementText, { exact: false })
  ).toBeVisible();
});
