import { mkdir, writeFile } from 'node:fs/promises';
import type { Account } from '@utils/env.util';

export type AuthStateMetadata = {
  readonly generatedAt: string;
  readonly runId: string | null;
  readonly runAttempt: string | null;
  readonly accounts: readonly Account[];
};

export type WriteAuthStateMetadataOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: Date;
};

const AUTH_STATE_ACCOUNTS = ['populated', 'empty'] as const satisfies readonly Account[];

export async function writeAuthStateMetadata(
  authDir: URL,
  options: WriteAuthStateMetadataOptions = {}
): Promise<void> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const metadata = {
    generatedAt: now.toISOString(),
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    accounts: AUTH_STATE_ACCOUNTS,
  } satisfies AuthStateMetadata;

  await mkdir(authDir, { recursive: true });
  await writeFile(new URL('metadata.json', authDir), `${JSON.stringify(metadata, null, 2)}\n`);
}
