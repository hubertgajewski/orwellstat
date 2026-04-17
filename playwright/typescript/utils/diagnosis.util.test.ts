import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { redactSensitive } from './diagnosis.util.ts';

describe('redactSensitive', () => {
  test('redacts Cookie header value', () => {
    const input = 'Cookie: session=abc123def456; path=/';
    const output = redactSensitive(input);
    assert.equal(output, 'Cookie: session=[REDACTED]; path=/');
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
});
