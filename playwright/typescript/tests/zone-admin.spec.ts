import { test, expect, type Locator } from '@fixtures/base.fixture';
import { AdminPage } from '@pages/authenticated/admin.page';
import { HitsPage } from '@pages/authenticated/hits.page';
import { fireTrackingHit, TRACKING_FIXTURES } from '@utils/track-hit.util';
import { requireCredentials } from '@utils/env.util';

// Email address used for the mutating change-email test. example.com is the
// IANA-reserved domain for documentation, never resolves to a real inbox, and
// passes the server's regex format check — every other guard (quote/backtick
// rejection, the `example@example.com` literal blocklist) is also satisfied for
// this exact address. The afterEach hook reads the populated account's actual
// email at test start and writes it back after the test, so this value never
// lingers on the account.
const SAFE_TEST_EMAIL = 'orwellstat-playwright@example.com';

// Per-field metadata for the 5 text inputs the populated user sees on
// /zone/admin/. The expectedMaxlength values are pinned to the live DOM as a
// drift guard: if the server-rendered `maxlength` ever changes, the test fails
// loudly here rather than silently re-baselining truncation behaviour.
type TextField = {
  readonly name: string;
  readonly getField: (p: AdminPage) => Locator;
  readonly expectedMaxlength: number;
};

const TEXT_FIELDS = [
  {
    name: 'oldpassword',
    getField: (p) => p.currentPasswordField,
    expectedMaxlength: 64,
  },
  {
    name: 'newpassword',
    getField: (p) => p.newPasswordField,
    expectedMaxlength: 64,
  },
  {
    name: 'newpassword2',
    getField: (p) => p.confirmPasswordField,
    expectedMaxlength: 64,
  },
  { name: 'email', getField: (p) => p.emailField, expectedMaxlength: 255 },
  { name: 'block_ip', getField: (p) => p.blockIpField, expectedMaxlength: 15 },
] as const satisfies readonly TextField[];

// Reads `.value` from an `<input>` Locator. Wraps the XHTML workaround so the
// detail (Playwright's `toHaveValue` and `inputValue` fail on application/xhtml+xml
// because of strict-nodeName checks) lives in one place — every other call site
// just sees a typed string.
async function readInputValue(locator: Locator): Promise<string> {
  return locator.evaluate<string, HTMLInputElement>((el) => el.value);
}

// Read-only describe — every test here either inspects the rendered form or submits
// values the server short-circuits before the underlying profile UPDATE (wrong
// current password, "example@example.com"). Safe to run on the shared populated
// account in parallel across all 5 browsers.
test.describe('admin page - settings form', { tag: '@regression' }, () => {
  test('form renders with the expected default state and editable fields', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();

    await expect(admin.heading).toBeVisible();

    // Email field has a non-empty value (issue #98 acceptance criterion). On
    // application/xhtml+xml documents Playwright's `toHaveValue` and `inputValue`
    // both fail because the strict nodeName check expects "INPUT" but XML preserves
    // the lowercase "input" — read `.value` via JS evaluation instead.
    const emailValue = await readInputValue(admin.emailField);
    expect(emailValue, 'email field rendered as empty').not.toBe('');

    // Cookie radio "Nie" is checked, "Tak" is not (issue #98 acceptance criterion).
    await expect(admin.blockCookieRadioNo).toBeChecked();
    await expect(admin.blockCookieRadioYes).not.toBeChecked();

    // Every text field is editable, both radios enabled, submit button enabled
    // (issue #98 acceptance criterion: "all form fields are editable").
    for (const f of TEXT_FIELDS) {
      await expect(f.getField(admin), `${f.name} not editable`).toBeEditable();
    }
    await expect(admin.blockCookieRadioYes).toBeEnabled();
    await expect(admin.blockCookieRadioNo).toBeEnabled();
    await expect(admin.submitButton).toBeEnabled();

    // SMS-tracking fields are server-rendered only for a hard-coded username
    // allowlist (the SMS-alert feature is enabled on a per-user basis); the
    // populated and empty test accounts are not on that list, so the markup must
    // be absent.
    await expect(admin.mobileField).toHaveCount(0);
    await expect(admin.ipToSmsField).toHaveCount(0);
    await expect(admin.hostToSmsField).toHaveCount(0);
  });

  for (const f of TEXT_FIELDS) {
    test(`${f.name} input truncates at its maxlength attribute`, async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.goto();
      const input = f.getField(admin);

      const maxAttr = await input.getAttribute('maxlength');
      expect(maxAttr, `${f.name}: maxlength missing`).not.toBeNull();
      const max = Number(maxAttr);
      expect(max, `${f.name}: maxlength must be positive`).toBeGreaterThan(0);
      // Drift guard: a product-side change to the server-rendered maxlength should
      // require updating the test data deliberately, not silently re-baseline.
      expect(max, `${f.name}: maxlength changed in product`).toBe(f.expectedMaxlength);

      // Boundary: max+1 chars is the smallest input that should engage truncation.
      // toHaveJSProperty reads .value directly and works on XHTML.
      await input.fill('a'.repeat(max + 1));
      await expect(input).toHaveJSProperty('value', 'a'.repeat(max));
      // Intentionally NO submit — maxlength is purely client-side and submitting
      // could mutate the populated account's profile.
    });
  }

  test('wrong current password shows the "incorrect password" error', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();

    // Per issue #98's Implementation Hint: NEVER fill currentPasswordField with
    // the real credential. The server validates oldpassword first and rejects
    // with the message asserted below — no profile UPDATE happens regardless of
    // new/confirm values.
    await admin.currentPasswordField.fill('test');
    await admin.newPasswordField.fill('abc123');
    await admin.confirmPasswordField.fill('abc123');
    await admin.submitButton.click();

    await expect(admin.statusMessage).toContainText(AdminPage.MSG_WRONG_PASSWORD);
  });

  test('the literal example.com placeholder email is rejected', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();

    // The server rejects the literal "example@example.com" before any profile
    // UPDATE — no restore needed.
    await admin.emailField.fill('example@example.com');
    await admin.submitButton.click();

    await expect(admin.statusMessage).toContainText(AdminPage.MSG_INVALID_EMAIL_PLACEHOLDER);
  });
});

// The mismatched-new-passwords path requires sending the REAL current password to
// reach the new==confirm comparison branch on the server (the wrong-password test
// above stops at the signIn check before that branch is reached). Trace/video/screenshot
// cannot be overridden at the describe scope (Playwright treats them as
// worker-scoped and rejects per-describe `test.use`), so the residual risk on a
// retried CI run is that the trace's POST body for the form submission contains
// the password in cleartext. Mitigations:
//   - The base fixture's DOM snapshot only fires on failure, and the post-submit
//     DOM has the password fields blanked by the server.
//   - `screenshot: 'only-on-failure'` only captures the masked password input.
//   - `trace: 'on-first-retry'` only captures on retry; locally retries=0.
//   - The credential is read from `process.env.ORWELLSTAT_PASSWORD`, never logged
//     and never echoed to console.
test.describe('admin page - password mismatch (real credential)', { tag: '@regression' }, () => {
  test('correct current password with non-matching new passwords shows the mismatch error', async ({
    page,
  }) => {
    const admin = new AdminPage(page);
    const { password } = requireCredentials('populated');
    await admin.goto();

    await admin.currentPasswordField.fill(password);
    await admin.newPasswordField.fill('newpw-attempt-1');
    await admin.confirmPasswordField.fill('newpw-attempt-2');
    await admin.submitButton.click();

    // With oldpassword correct AND newpassword != newpassword2, the server
    // surfaces this validation error and runs no profile UPDATE — the test is
    // non-mutating.
    await expect(admin.statusMessage).toContainText(AdminPage.MSG_PASSWORD_MISMATCH);
  });
});

// Mutating describe — every test changes server-side profile state and restores
// it afterwards. Confined to a single browser project (the desktop "Chromium")
// so the 5-browser parallel matrix can't race on the shared populated account,
// and serialised within the file so a teardown can finish before the next test
// reads state. The skip is keyed on `project.name` rather than `browserName`
// because Mobile Chrome also has `browserName === 'chromium'` and would race
// against desktop Chromium otherwise; project.name is unique per matrix entry.
test.describe(
  'admin page - mutating settings (Chromium project only)',
  { tag: '@regression' },
  () => {
    // Skip-by-project-name keyed off `test.info().project.name` (rather than the
    // usual `({ browserName })` predicate) because Mobile Chrome shares
    // `browserName === 'chromium'` and would otherwise race against desktop
    // Chromium on the same backend account in CI's parallel matrix.
    test.skip(
      () => test.info().project.name !== 'Chromium',
      'mutating tests run only on the desktop Chromium project to avoid racing on the shared populated account'
    );
    test.describe.configure({ mode: 'serial' });

    // Captured fresh per test in beforeEach so the afterEach hook can restore the
    // value the test inherited even if a previous test crashed without restoring.
    let originalEmail = '';

    test.beforeEach(async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.goto();
      // Read all three mutable fields in parallel — independent DOM lookups.
      const [email, blockIp, cookieIsTak] = await Promise.all([
        readInputValue(admin.emailField),
        readInputValue(admin.blockIpField),
        admin.blockCookieRadioYes.isChecked(),
      ]);
      originalEmail = email;
      if (originalEmail === SAFE_TEST_EMAIL) {
        // A previous test's restore did not run; refusing to silently overwrite
        // the unknown real address again. Manual reset required.
        throw new Error(
          `Defensive precheck: email is already ${SAFE_TEST_EMAIL} — a previous run's restore did not complete. Reset the populated account's email manually before re-running.`
        );
      }
      // Coalesce both reset paths into a single submit so a dirty inherited
      // state costs one form round-trip, not two.
      let needsSubmit = false;
      if (blockIp !== '') {
        await admin.blockIpField.fill('');
        needsSubmit = true;
      }
      if (cookieIsTak) {
        await admin.blockCookieRadioNo.check();
        needsSubmit = true;
      }
      if (needsSubmit) {
        await admin.submitButton.click();
        await expect(admin.statusMessage).toContainText(AdminPage.MSG_SUCCESS);
      }
    });

    test.afterEach(async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.goto();
      const [current, blockIp, cookieIsTak] = await Promise.all([
        readInputValue(admin.emailField),
        readInputValue(admin.blockIpField),
        admin.blockCookieRadioYes.isChecked(),
      ]);
      let needsSubmit = false;
      if (current !== originalEmail) {
        await admin.emailField.fill(originalEmail);
        needsSubmit = true;
      }
      if (blockIp !== '') {
        await admin.blockIpField.fill('');
        needsSubmit = true;
      }
      if (cookieIsTak) {
        await admin.blockCookieRadioNo.check();
        needsSubmit = true;
      }
      if (needsSubmit) {
        await admin.submitButton.click();
        await expect(admin.statusMessage).toContainText(AdminPage.MSG_SUCCESS);
      }
    });

    test('changing email to a valid address persists and renders the success message', async ({
      page,
    }) => {
      const admin = new AdminPage(page);

      await admin.emailField.fill(SAFE_TEST_EMAIL);
      await admin.submitButton.click();
      await expect(admin.statusMessage).toContainText(AdminPage.MSG_SUCCESS);

      // Re-fetch the form to confirm the change persisted to the DB rather than just
      // echoing back the submitted value.
      await admin.goto();
      const persisted = await readInputValue(admin.emailField);
      expect(persisted).toBe(SAFE_TEST_EMAIL);
    });

    test("block_ip set to the test runner's public IP suppresses subsequent tracking hits", async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const admin = new AdminPage(page);

      // Seed one tracking hit while block_ip is still empty so we can read the
      // server-recorded outgoing IP from /zone/hits/. The browser-to-tracker
      // outgoing IP is exactly what the block_ip filter compares against — same
      // source = same IP = block matches on the next hit.
      const seed = await fireTrackingHit(page, baseURL, TRACKING_FIXTURES[0], testInfo);

      const hitsPage = new HitsPage(page);
      await hitsPage.goto();
      await hitsPage.submitButton.click();
      const seededRow = hitsPage.resultRows.filter({ hasText: seed.runMarker });
      await expect(seededRow).toHaveCount(1);

      // Pull the IP out of the seeded row's "Nazwa hosta/IP: <ip>" tooltip — the
      // same primitive zone-hits.spec.ts uses to read filter inputs from a seeded
      // row. The block_ip field is maxlength=15 (IPv4 only); skip with a clear
      // reason if the server recorded an IPv6 source so the test does not silently
      // store a truncated value that would never match.
      const sourceIp = await seededRow.evaluate<string>((row) => {
        const span = Array.from(row.querySelectorAll<HTMLSpanElement>('span[title]')).find((s) =>
          s.title.startsWith('Nazwa hosta/IP')
        );
        if (!span) return '';
        const colon = span.title.indexOf(':');
        return colon >= 0 ? span.title.slice(colon + 1).trim() : '';
      });
      test.skip(
        !sourceIp || sourceIp.length > 15,
        `block_ip field is maxlength=15; cannot exercise blocking with seed IP "${sourceIp}"`
      );

      // Apply the IP block.
      await admin.goto();
      await admin.blockIpField.fill(sourceIp);
      await admin.submitButton.click();
      await expect(admin.statusMessage).toContainText(AdminPage.MSG_SUCCESS);

      // Fire a second tracking hit. With block_ip matching the source, the tracker
      // must reject the request before recording it — the hit is never persisted.
      const blocked = await fireTrackingHit(page, baseURL, TRACKING_FIXTURES[0], testInfo);

      // Remove the IP block before asserting absence. /zone/hits/ also filters its
      // visible rows on the user's current block_ip, so the seed row — which IS
      // recorded in the DB but matches block_ip — would also be filtered out,
      // giving us a tautological count(0) for both rows. With block_ip unset, the
      // seed row becomes visible again, distinguishing "tracker rejected the
      // second hit" (intended) from "the visibility filter hid both hits"
      // (uninteresting).
      await admin.goto();
      await admin.blockIpField.fill('');
      await admin.submitButton.click();
      await expect(admin.statusMessage).toContainText(AdminPage.MSG_SUCCESS);

      await hitsPage.goto();
      await hitsPage.submitButton.click();
      await expect(hitsPage.resultRows.filter({ hasText: seed.runMarker })).toHaveCount(1);
      await expect(hitsPage.resultRows.filter({ hasText: blocked.runMarker })).toHaveCount(0);
    });

    test('block_cookie=Tak suppresses tracking hits from the same browser session', async ({
      page,
      baseURL,
    }, testInfo) => {
      if (!baseURL) throw new Error('baseURL must be set in playwright.config.ts');
      const admin = new AdminPage(page);

      // Flip the cookie-block radio to "Tak" and submit. The server response sets a
      // marker cookie on the orwellstat domain inside the SAME browser context that
      // fireTrackingHit will use to run the tracking script — same context = same
      // cookie jar = the tracker recognises the marker and skips counting.
      await admin.goto();
      await admin.blockCookieRadioYes.check();
      await admin.submitButton.click();
      await expect(admin.statusMessage).toContainText(AdminPage.MSG_SUCCESS);

      const blocked = await fireTrackingHit(page, baseURL, TRACKING_FIXTURES[0], testInfo);

      const hitsPage = new HitsPage(page);
      await hitsPage.goto();
      await hitsPage.submitButton.click();
      await expect(hitsPage.resultRows.filter({ hasText: blocked.runMarker })).toHaveCount(0);
    });
  }
);
