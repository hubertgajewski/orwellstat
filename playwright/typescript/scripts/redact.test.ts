import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Spawn the CLI exactly the way the Python caller does: same Node flags,
// same script path. Tests the full subprocess contract — argv, stdin, stdout —
// not just the imported function (already covered in diagnosis.util.test.ts).

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'redact.ts');

function runRedact(input: string): string {
  return execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', SCRIPT],
    { input, encoding: 'utf8' }
  );
}

describe('redact CLI (stdin → stdout)', () => {
  test('redacts Cookie header value', () => {
    assert.equal(runRedact('Cookie: session=abc123; path=/'), 'Cookie: session=[REDACTED]; path=/');
  });

  test('redacts Authorization: Bearer token', () => {
    assert.equal(
      runRedact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'),
      'Authorization: Bearer [REDACTED]'
    );
  });

  test('redacts standalone bearer token of 12+ chars', () => {
    assert.equal(runRedact('bearer abcdefghijkl'), 'bearer [REDACTED]');
  });

  test('masks email local-part, keeps first char and domain', () => {
    assert.equal(runRedact('alice@example.com'), 'a***@example.com');
  });

  test('passes through content with no matches unchanged', () => {
    const input = '<html><body><p>Hello world</p></body></html>';
    assert.equal(runRedact(input), input);
  });

  test('handles empty stdin without error', () => {
    assert.equal(runRedact(''), '');
  });

  test('handles multi-line input independently per line', () => {
    const input = 'Cookie: a=1\nCookie: b=2\nAuthorization: Bearer tok_abcdefghij12';
    assert.equal(
      runRedact(input),
      'Cookie: a=[REDACTED]\nCookie: b=[REDACTED]\nAuthorization: Bearer [REDACTED]'
    );
  });
});
