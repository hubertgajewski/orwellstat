import { test, expect } from '@fixtures/base.fixture';
import { AboutSystemPage } from '@pages/public/about-system.page';
import { expectHeadings } from '@utils/string.util';

test('about system page - headings and statsbar content', async ({ page }) => {
  await test.step('navigate to page', async () => {
    await page.goto(AboutSystemPage.url);
  });

  const statsbar = page.locator('#statsbar');

  await test.step('verify headings', async () => {
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

  await test.step('verify statsbar login section', async () => {
    await expect(statsbar.getByText(AboutSystemPage.loggedInAs, { exact: false })).toBeVisible();
    await expect(
      statsbar.getByRole('button', { name: AboutSystemPage.logoutButton, exact: true })
    ).toBeVisible();
  });

  await test.step('verify intro and external links', async () => {
    await expect(
      statsbar.getByText(AboutSystemPage.orwellStatIntro, { exact: false })
    ).toBeVisible();
    await expect
      .soft(statsbar.getByRole('link', { name: AboutSystemPage.wsbNlu.name, exact: true }))
      .toHaveAttribute('href', AboutSystemPage.wsbNlu.href);
    await expect
      .soft(statsbar.getByRole('link', { name: AboutSystemPage.hubertGajewski.name, exact: true }))
      .toHaveAttribute('href', AboutSystemPage.hubertGajewski.href);
    await expect
      .soft(statsbar.getByRole('link', { name: AboutSystemPage.tomaszGorazd.name, exact: true }))
      .toHaveAttribute('href', AboutSystemPage.tomaszGorazd.href);
  });

  await test.step('verify browser and OS counts and lists', async () => {
    await expect(statsbar.getByText(AboutSystemPage.browserCount, { exact: false })).toBeVisible();
    await expect(statsbar.getByText(AboutSystemPage.osCount, { exact: false })).toBeVisible();

    for (const browser of AboutSystemPage.sampleBrowsers) {
      await expect(
        statsbar.getByRole('listitem').getByText(browser, { exact: true })
      ).toBeVisible();
    }

    for (const os of AboutSystemPage.sampleOSes) {
      await expect(statsbar.getByRole('listitem').getByText(os, { exact: true })).toBeVisible();
    }
  });

  await test.step('verify requirements screenshots', async () => {
    for (const screenshot of Object.values(AboutSystemPage.screenshots)) {
      await expect
        .soft(statsbar.locator(`img[src="${screenshot.src}"]`))
        .toHaveAttribute('alt', screenshot.alt);
    }
  });

  await test.step('verify requirements text', async () => {
    await expect
      .soft(statsbar.getByRole('link', { name: AboutSystemPage.adobeSvgViewer.name, exact: true }))
      .toHaveAttribute('href', AboutSystemPage.adobeSvgViewer.href);
    await expect
      .soft(statsbar.getByText(AboutSystemPage.vgaRequirementText, { exact: false }))
      .toBeVisible();
    await expect
      .soft(statsbar.getByText(AboutSystemPage.hdRequirementText, { exact: false }))
      .toBeVisible();
  });
});
