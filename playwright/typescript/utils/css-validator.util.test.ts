import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { getCssErrors, formatCssErrors } from './css-validator.util.ts';

describe('getCssErrors (local CSS validator)', () => {
  test('returns empty array for valid CSS', () => {
    const css = 'body { color: red; margin: 0 auto; }\n.h1 { font-size: 2rem; }\n';
    const errors = getCssErrors(css, 'https://example.com/ok.css');
    assert.deepEqual(errors, []);
  });

  test('reports per-line errors for invalid property values', () => {
    const css = ['body {', '  color: not-a-color;', '}'].join('\n');
    const errors = getCssErrors(css, 'https://example.com/bad.css');
    assert.ok(
      errors.length >= 1,
      `expected at least one error, got: ${JSON.stringify(errors, null, 2)}`
    );
    const firstOnLine2 = errors.find((e) => e.line === 2);
    assert.ok(firstOnLine2, 'expected an error pinned to line 2 (the invalid declaration)');
    assert.match(firstOnLine2!.message, /color/i);
  });

  test('reports unknown properties with a line number', () => {
    const css = ['.wrap {', '  totally-made-up: 5px;', '}'].join('\n');
    const errors = getCssErrors(css, 'https://example.com/bad.css');
    const unknown = errors.find((e) => /unknown property/i.test(e.message));
    assert.ok(
      unknown,
      `expected an "Unknown property" error, got: ${JSON.stringify(errors, null, 2)}`
    );
    assert.equal(unknown!.line, 2);
    assert.match(unknown!.message, /totally-made-up/);
  });

  test('reports unknown at-rules with a line number', () => {
    const css = ['body { color: red; }', '@bogus-rule something;'].join('\n');
    const errors = getCssErrors(css, 'https://example.com/bad.css');
    const atrule = errors.find((e) => /unknown at-rule/i.test(e.message));
    assert.ok(
      atrule,
      `expected an "Unknown at-rule" error, got: ${JSON.stringify(errors, null, 2)}`
    );
    assert.equal(atrule!.line, 2);
    assert.match(atrule!.message, /bogus-rule/);
  });

  test('aggregates multiple errors across different lines', () => {
    const css = [
      'body {',
      '  color: not-a-color;',
      '  totally-made-up: 5px;',
      '}',
      '@bogus-rule hello;',
    ].join('\n');
    const errors = getCssErrors(css, 'https://example.com/many.css');
    const lines = errors.map((e) => e.line).sort();
    // Each of the three defects should appear on its own line.
    assert.ok(lines.includes(2), `missing line 2 in ${JSON.stringify(lines)}`);
    assert.ok(lines.includes(3), `missing line 3 in ${JSON.stringify(lines)}`);
    assert.ok(lines.includes(5), `missing line 5 in ${JSON.stringify(lines)}`);
  });
});

describe('formatCssErrors', () => {
  test('includes the source URL and one entry per error', () => {
    const errors = [
      { name: 'SyntaxMatchError', message: 'Invalid value for `color` property', line: 2 },
      { name: 'SyntaxReferenceError', message: 'Unknown property `foo`', line: 7 },
    ];
    const out = formatCssErrors(errors, 'https://example.com/site.css');
    assert.match(out, /CSS errors in https:\/\/example\.com\/site\.css:/);
    assert.match(out, /Line 2: Invalid value for `color` property/);
    assert.match(out, /Line 7: Unknown property `foo`/);
  });

  test('falls back to ? when a line number is missing', () => {
    const out = formatCssErrors(
      [{ name: 'SyntaxError', message: 'mysterious failure' }],
      'https://example.com/x.css'
    );
    assert.match(out, /Line \?: mysterious failure/);
  });
});
