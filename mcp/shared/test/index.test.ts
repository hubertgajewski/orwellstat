import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { repoRoot, ok, err, requireDistBuilt } from '../index.js';

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

  describe('requireDistBuilt', () => {
    const savedEnv = { ...process.env };
    const PRESENT = fileURLToPath(import.meta.url);
    const MISSING = resolve(PRESENT, '../does-not-exist-dist-index.js');

    beforeEach(() => {
      delete process.env.CI;
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      process.env = { ...savedEnv };
      vi.restoreAllMocks();
    });

    it('returns true and stays silent when the build exists', () => {
      process.env.CI = 'true';
      expect(requireDistBuilt(PRESENT, 'negotiation')).toBe(true);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('warns and returns false when the build is missing outside CI', () => {
      expect(requireDistBuilt(MISSING, 'negotiation')).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[negotiation] Skipping tests:')
      );
    });

    it('throws when the build is missing under CI', () => {
      process.env.CI = 'true';
      expect(() => requireDistBuilt(MISSING, 'negotiation')).toThrow(
        /\[negotiation\] Refusing to skip tests in CI/
      );
    });

    // `CI=false` is the conventional opt-out, and 'false' is a truthy string:
    // a truthiness check here would throw instead of skipping.
    it.each(['false', ''])('treats CI=%o as not CI and skips instead', (value) => {
      process.env.CI = value;
      expect(requireDistBuilt(MISSING, 'negotiation')).toBe(false);
    });

    it('names the missing path and the build command in its message', () => {
      process.env.CI = '1';
      expect(() => requireDistBuilt(MISSING, 'negotiation')).toThrow(MISSING);
      expect(() => requireDistBuilt(MISSING, 'negotiation')).toThrow('npm run build');
    });
  });
});
