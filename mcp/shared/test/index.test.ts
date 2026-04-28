import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { repoRoot, ok, err } from '../index.js';

describe('mcp/shared', () => {
  describe('repoRoot', () => {
    const savedEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.REPO_ROOT;
    });

    afterEach(() => {
      process.env = { ...savedEnv };
    });

    it('honors REPO_ROOT when set', () => {
      process.env.REPO_ROOT = '/tmp/some/repo';
      expect(repoRoot()).toBe(resolve('/tmp/some/repo'));
    });

    it('resolves relative REPO_ROOT against the current working directory', () => {
      process.env.REPO_ROOT = './sub/dir';
      expect(repoRoot()).toBe(resolve(process.cwd(), 'sub/dir'));
    });

    it('falls back to process.cwd() when REPO_ROOT is unset', () => {
      expect(repoRoot()).toBe(resolve(process.cwd()));
    });
  });

  describe('ok', () => {
    it('wraps data as a single text content block with pretty-printed JSON', () => {
      const result = ok({ a: 1, b: ['x', 'y'] });
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify({ a: 1, b: ['x', 'y'] }, null, 2) }],
      });
      expect((result as { isError?: boolean }).isError).toBeUndefined();
    });

    it('round-trips through JSON.parse', () => {
      const data = { nested: { value: 42 }, list: [true, false] };
      const parsed = JSON.parse(ok(data).content[0].text);
      expect(parsed).toEqual(data);
    });
  });

  describe('err', () => {
    it('prefixes the message with ERROR: and sets isError true', () => {
      expect(err('boom')).toEqual({
        content: [{ type: 'text', text: 'ERROR: boom' }],
        isError: true,
      });
    });
  });
});
