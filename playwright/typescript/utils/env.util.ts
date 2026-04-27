import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

export function loadEnv(importMetaUrl: string, levelsUp: number): void {
  const dir = dirname(fileURLToPath(importMetaUrl));
  const parts = Array(levelsUp).fill('..');
  dotenv.config({ path: resolve(dir, ...parts, '.env') });
  dotenv.config({ path: resolve(dir, ...parts, '.vars') });
}

export type Account = 'populated' | 'empty';

export function requireCredentials(account: Account = 'populated'): {
  user: string;
  password: string;
} {
  if (account === 'empty') {
    const { ORWELLSTAT_USER_EMPTY, ORWELLSTAT_PASSWORD_EMPTY } = process.env;
    if (!ORWELLSTAT_USER_EMPTY || !ORWELLSTAT_PASSWORD_EMPTY) {
      throw new Error(
        'Missing ORWELLSTAT_USER_EMPTY or ORWELLSTAT_PASSWORD_EMPTY. ' +
          'Set them in .env (local) or as repository secrets (CI).'
      );
    }
    return { user: ORWELLSTAT_USER_EMPTY, password: ORWELLSTAT_PASSWORD_EMPTY };
  }

  const { ORWELLSTAT_USER, ORWELLSTAT_PASSWORD } = process.env;
  if (!ORWELLSTAT_USER || !ORWELLSTAT_PASSWORD) {
    throw new Error(
      'Missing ORWELLSTAT_USER or ORWELLSTAT_PASSWORD. ' +
        'Set them in .env (local) or as repository secrets (CI).'
    );
  }
  return { user: ORWELLSTAT_USER, password: ORWELLSTAT_PASSWORD };
}

// Canonical email address for the populated account on stage. Used by the
// zone-admin mutating-settings tests to anchor the post-test restore on a
// source of truth that survives a cancelled afterEach — see #397.
export function requireRealEmail(): string {
  const value = process.env.ORWELLSTAT_EMAIL;
  if (!value || value.trim() === '') {
    throw new Error(
      'Missing ORWELLSTAT_EMAIL. ' +
        'Set it in .env (local) or as a repository secret (CI). ' +
        'It must match the email currently stored on the populated account.'
    );
  }
  return value;
}
