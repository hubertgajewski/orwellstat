import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { redactSensitive } from './diagnosis.util.ts';

describe('redactSensitive', () => {
  test('redacts Cookie header value', () => {
    const input = 'Cookie: session=abc123def456; path=/';
    const output = redactSensitive(input);
    // The first key=value is masked by the `Cookie:` rule; `; path=/` is then
    // masked by the multi-pair `; key=value` rule. Over-redacting cookie
    // attributes (Path/Domain/Max-Age/etc.) is intentional — the LLM does not
    // need them, and any `; key=value` pair could carry a secret.
    assert.equal(output, 'Cookie: session=[REDACTED]; path=[REDACTED]');
  });

  test('redacts Cookie header case-insensitively', () => {
    assert.match(redactSensitive('cookie: csrf=xyz'), /cookie: csrf=\[REDACTED\]/);
    assert.match(redactSensitive('COOKIE: id=42'), /COOKIE: id=\[REDACTED\]/);
  });

  test('redacts Authorization: Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';
    assert.equal(redactSensitive(input), 'Authorization: Bearer [REDACTED]');
  });

  test('redacts standalone bearer token of 12+ chars', () => {
    assert.equal(redactSensitive('bearer abcdefghijkl'), 'bearer [REDACTED]');
    // Below threshold — left alone to avoid false positives on words like "bearer bad".
    assert.equal(redactSensitive('bearer short'), 'bearer short');
  });

  test('does not re-match [REDACTED] produced by an earlier pattern', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';
    // Apply twice — should be idempotent, not escalating.
    assert.equal(redactSensitive(redactSensitive(input)), 'Authorization: Bearer [REDACTED]');
  });

  test('masks email local-part, keeps first char and domain', () => {
    assert.equal(redactSensitive('alice@example.com'), 'a***@example.com');
    assert.equal(redactSensitive('user.name+tag@sub.example.co.uk'), 'u***@sub.example.co.uk');
    assert.equal(redactSensitive('a@b.co'), 'a***@b.co');
  });

  test('redacts a mixed DOM with cookie, bearer, and email together', () => {
    const input = [
      '<script>',
      '  fetch("/api", { headers: { Cookie: "session=s3cret; theme=dark", Authorization: "Bearer tok_abcdef123456" } });',
      '  const contact = "admin@example.org";',
      '</script>',
    ].join('\n');
    const output = redactSensitive(input);
    assert.match(output, /Cookie: "session=\[REDACTED\]/);
    assert.match(output, /Authorization: "Bearer \[REDACTED\]/);
    assert.match(output, /a\*\*\*@example\.org/);
    assert.doesNotMatch(output, /s3cret/);
    assert.doesNotMatch(output, /tok_abcdef123456/);
    assert.doesNotMatch(output, /admin@example\.org/);
  });

  test('passes through content with no matches unchanged', () => {
    const input = '<html><body><p>Hello world</p></body></html>';
    assert.equal(redactSensitive(input), input);
  });

  test('preserves char budget: no-match input stays identical in length', () => {
    const input = 'x'.repeat(30_000);
    const output = redactSensitive(input);
    assert.equal(output.length, 30_000);
    assert.equal(output, input);
  });

  test('preserves XHTML structural characters (no <, >, &, " introduced)', () => {
    // Realistic XHTML fragment containing sensitive data embedded in attributes, text, and script.
    const input = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<html xmlns="http://www.w3.org/1999/xhtml">',
      '  <head><title>Login</title></head>',
      '  <body>',
      '    <meta name="user" content="alice@example.com"/>',
      '    <script>document.cookie = "Cookie: session=abc123def456; path=/"; </script>',
      '    <pre>Authorization: Bearer tok_supersecret_12345</pre>',
      '    <p>Contact us at support@example.org &amp; sales@example.org.</p>',
      '  </body>',
      '</html>',
    ].join('\n');
    const output = redactSensitive(input);

    const count = (s: string, ch: string) => (s.match(new RegExp(`\\${ch}`, 'g')) ?? []).length;
    assert.equal(count(output, '<'), count(input, '<'), '< count unchanged');
    assert.equal(count(output, '>'), count(input, '>'), '> count unchanged');
    assert.equal(count(output, '&'), count(input, '&'), '& count unchanged');
    assert.equal(count(output, '"'), count(input, '"'), '" count unchanged');

    // Validate well-formedness end-to-end with libxml2 (available in CI via xmllint).
    // Skip gracefully if xmllint is not installed on the local machine.
    try {
      execFileSync('xmllint', ['--noout', '-'], {
        input: output,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }

    // Spot-check that sensitive values are gone.
    assert.doesNotMatch(output, /alice@example\.com/);
    assert.doesNotMatch(output, /abc123def456/);
    assert.doesNotMatch(output, /tok_supersecret_12345/);
  });

  test('redacts each line independently (multi-line DOM)', () => {
    const input = 'Cookie: a=1\nCookie: b=2\nauthorization: bearer tok_abcdefghij12';
    const output = redactSensitive(input);
    assert.equal(
      output,
      'Cookie: a=[REDACTED]\nCookie: b=[REDACTED]\nauthorization: bearer [REDACTED]'
    );
  });

  test('redacts Set-Cookie header value', () => {
    const input = 'Set-Cookie: session=abc123def456; Path=/; HttpOnly';
    const output = redactSensitive(input);
    // The session value is masked by the Set-Cookie rule; Path=/ is masked by
    // the multi-pair `; key=value` rule (acceptable over-redaction).
    assert.equal(output, 'Set-Cookie: session=[REDACTED]; Path=[REDACTED]; HttpOnly');
  });

  test('redacts Set-Cookie case-insensitively (bypass: case variants)', () => {
    assert.match(redactSensitive('SET-COOKIE: csrf=xyz'), /SET-COOKIE: csrf=\[REDACTED\]/);
    assert.match(redactSensitive('set-cookie: id=42abcd'), /set-cookie: id=\[REDACTED\]/);
  });

  test('redacts every value in a multi-pair Cookie chain', () => {
    const input = 'Cookie: a=1; b=2; c=3';
    const output = redactSensitive(input);
    assert.equal(output, 'Cookie: a=[REDACTED]; b=[REDACTED]; c=[REDACTED]');
  });

  test('redacts multi-pair Cookie even when separator has no surrounding space (bypass: whitespace)', () => {
    assert.equal(
      redactSensitive('Cookie: a=1;b=2;c=3'),
      'Cookie: a=[REDACTED];b=[REDACTED];c=[REDACTED]'
    );
  });

  test('redacts x-api-key header value', () => {
    assert.equal(redactSensitive('x-api-key: sk_live_abc123XYZ'), 'x-api-key: [REDACTED]');
  });

  test('redacts apikey JSON-style and tolerates quoting + casing (bypass: case + quote variants)', () => {
    assert.equal(redactSensitive('"apikey": "sk_live_abc123XYZ"'), '"apikey": "[REDACTED]"');
    assert.match(redactSensitive('X-API-Key: sk_live_abc123XYZ'), /X-API-Key: \[REDACTED\]/);
    assert.match(redactSensitive("apikey = 'sk_live_abc123XYZ'"), /apikey = '?\[REDACTED\]'?/);
  });

  test('does not mask short placeholder values for x-api-key (anti-false-positive: <8 chars stays)', () => {
    // 8-char minimum on the value prevents masking dev placeholders like `TODO`.
    assert.equal(redactSensitive('apikey: TODO'), 'apikey: TODO');
  });

  test('redacts apikey / api_key / token in a query string', () => {
    assert.equal(
      redactSensitive('https://example.com/x?apikey=sk_live_secret_value&page=1'),
      'https://example.com/x?apikey=[REDACTED]&page=1'
    );
    assert.equal(
      redactSensitive('https://example.com/x?api_key=sk_live_secret_value'),
      'https://example.com/x?api_key=[REDACTED]'
    );
    assert.equal(
      redactSensitive('https://example.com/x?token=eyJabcdef.eyJpayload.sigtail'),
      // The JWT rule runs after the query-string rule; once the value is
      // already `[REDACTED]`, no `eyJ…` shape remains for the JWT rule.
      'https://example.com/x?token=[REDACTED]'
    );
  });

  test('redacts query-string token under case-variant keys (bypass: case variants)', () => {
    assert.match(
      redactSensitive('https://example.com/x?Token=sk_live_secret_value'),
      /\?Token=\[REDACTED\]/
    );
    assert.match(
      redactSensitive('https://example.com/x?ApiKey=sk_live_secret_value'),
      /\?ApiKey=\[REDACTED\]/
    );
  });

  test('redacts a raw JWT anywhere in the text', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    assert.equal(
      redactSensitive(`<div data-token="${jwt}">…</div>`),
      '<div data-token="[REDACTED_JWT]">…</div>'
    );
  });

  test('does not match a JWT-like prefix below the per-segment length threshold (bypass guard)', () => {
    // Each segment requires 8+ base64url chars; below that, the rule must not
    // fire (avoids masking short test fixtures that happen to start with `eyJ`).
    const tooShort = 'eyJabc.eyJdef.sig123';
    assert.equal(redactSensitive(tooShort), tooShort);
  });

  test('JWT inside a Bearer header is masked by the Bearer rule, not the JWT rule', () => {
    // Order matters: the Authorization+Bearer rule runs before the JWT rule, so
    // the result keeps the `Bearer [REDACTED]` shape rather than `[REDACTED_JWT]`.
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    assert.equal(
      redactSensitive(`Authorization: Bearer ${jwt}`),
      'Authorization: Bearer [REDACTED]'
    );
  });

  test('known limitation: a JWT immediately followed by an email leaves the email local-part unmasked', () => {
    // The JWT rule replaces with `[REDACTED_JWT]`. The email rule's local-part
    // class is `[A-Za-z0-9._%+-]`, which excludes `]`, so when `]` appears
    // immediately before `@` (i.e. `[REDACTED_JWT]@…`), the email rule cannot
    // find a valid local-part character adjacent to the `@` and the email is
    // left as-is. Contrived in practice — JWTs and emails don't normally
    // adjoin, and any whitespace/quote/angle/HTML separator between them
    // restores the email rule's match. This test pins the current behavior
    // so a future change to the email rule's left context is detected.
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    assert.equal(redactSensitive(`${jwt}@example.com`), '[REDACTED_JWT]@example.com');

    // Sanity check: with any separator between JWT and email, both rules fire.
    assert.equal(
      redactSensitive(`<a href="${jwt}">user@example.com</a>`),
      '<a href="[REDACTED_JWT]">u***@example.com</a>'
    );
  });
});
