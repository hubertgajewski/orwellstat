import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

export function loadEnv(importMetaUrl: string, levelsUp: number): void {
  const dir = dirname(fileURLToPath(importMetaUrl));
  const parts = Array(levelsUp).fill('..');
  dotenv.config({ path: resolve(dir, ...parts, '.env') });
  dotenv.config({ path: resolve(dir, ...parts, '.vars') });
}

export function requireCredentials(): { user: string; password: string } {
  const { ORWELLSTAT_USER, ORWELLSTAT_PASSWORD } = process.env;
  if (!ORWELLSTAT_USER || !ORWELLSTAT_PASSWORD) {
    throw new Error(
      'Missing ORWELLSTAT_USER or ORWELLSTAT_PASSWORD. ' +
        'Set them in .env (local) or as repository secrets (CI).'
    );
  }
  return { user: ORWELLSTAT_USER, password: ORWELLSTAT_PASSWORD };
}
