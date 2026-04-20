import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

export function loadEnv(importMetaUrl: string, levelsUp: number): void {
  const dir = dirname(fileURLToPath(importMetaUrl));
  const parts = Array(levelsUp).fill('..');
  dotenv.config({ path: resolve(dir, ...parts, '.env') });
  dotenv.config({ path: resolve(dir, ...parts, '.vars') });
}

export type Account = 'filled' | 'empty';

export function requireCredentials(account: Account = 'filled'): { user: string; password: string } {
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

  // The legacy ORWELLSTAT_USER / ORWELLSTAT_PASSWORD pair remains the filled-account
  // default so existing CI, .env files, and forks keep working unchanged. _FILLED aliases
  // are honoured when set, to let users with both empty and filled symmetry opt in.
  const user = process.env.ORWELLSTAT_USER_FILLED ?? process.env.ORWELLSTAT_USER;
  const password = process.env.ORWELLSTAT_PASSWORD_FILLED ?? process.env.ORWELLSTAT_PASSWORD;
  if (!user || !password) {
    throw new Error(
      'Missing ORWELLSTAT_USER (or ORWELLSTAT_USER_FILLED) / ORWELLSTAT_PASSWORD. ' +
        'Set them in .env (local) or as repository secrets (CI).'
    );
  }
  return { user, password };
}
