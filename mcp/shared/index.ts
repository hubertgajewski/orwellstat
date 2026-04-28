import { resolve } from 'path';

export function repoRoot(): string {
  return resolve(process.env.REPO_ROOT ?? process.cwd());
}

export function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: `ERROR: ${message}` }],
    isError: true,
  };
}
