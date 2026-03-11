import { test, expect } from '@fixtures/base.fixture';
import { ContactPage } from '@pages/public/contact.page';
import { expectHeadings } from '@utils/string.util';

test('contact page - headings and statsbar content', async ({ page }) => {
  await page.goto(ContactPage.url);

  const statsbar = page.locator('#statsbar');

  await expectHeadings(page, [ContactPage.signIn, ContactPage.contact]);

  // Login section – authenticated state shows logout button
  await expect(
    statsbar.getByText(ContactPage.loggedInAs, { exact: false })
  ).toBeVisible();
  await expect(
    statsbar.getByRole('button', { name: ContactPage.logoutButton, exact: true })
  ).toBeVisible();

  // Contact section – text and external link
  await expect(
    statsbar.getByText(ContactPage.emailIntro, { exact: false })
  ).toBeVisible();
  const contactLink = statsbar.getByRole('link', {
    name: ContactPage.contactLinkUrl,
    exact: true,
  });
  await expect(contactLink).toHaveAttribute('href', ContactPage.contactLinkUrl);
  await expect(contactLink).toHaveAttribute('title', ContactPage.contactLinkTitle);
});
