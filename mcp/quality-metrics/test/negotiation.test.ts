/**
 * Protocol-era negotiation tests. These boot the built dist/index.js as a real
 * subprocess via StdioClientTransport: the 2026-07-28 era cannot be exercised
 * in-memory, because InMemoryTransport.createLinkedPair() connects 2025-era
 * instances only (SDK docs/migration/support-2026-07-28.md).
 *
 * Skipped automatically when dist/ has not been built yet.
 */

import { describe, expect, it } from 'vitest';
import {
  Client,
  InMemoryTransport,
  ProtocolErrorCode,
  UnsupportedProtocolVersionError,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createServer } from '../index.js';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_INDEX = resolve(__dirname, '../dist/index.js');
const DIST_BUILT = existsSync(DIST_INDEX);

if (!DIST_BUILT) {
  console.warn(
    `[negotiation] Skipping protocol-era tests: ${DIST_INDEX} is missing. Run \`npm run build\` first.`
  );
}

const TOOL_NAMES = ['get_defect_escape_rate', 'get_metrics_history', 'get_mttr'];

function serverEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function serverTransport() {
  return new StdioClientTransport({
    command: 'node',
    args: [DIST_INDEX],
    env: serverEnvironment(),
  });
}

describe.skipIf(!DIST_BUILT)('quality-metrics stdio protocol negotiation', () => {
  it('selects the modern 2026-07-28 era in auto mode and exposes every tool', async () => {
    const modernClient = new Client(
      { name: 'modern-negotiation-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );

    try {
      await modernClient.connect(serverTransport());
      expect(modernClient.getProtocolEra()).toBe('modern');

      const tools = await modernClient.listTools();
      expect(tools.tools.map(({ name }) => name).sort()).toEqual(TOOL_NAMES);
    } finally {
      await modernClient.close();
    }
  }, 30_000);

  it('keeps a default (legacy) client on the 2025-era handshake with the same tools', async () => {
    const legacyClient = new Client({ name: 'legacy-negotiation-client', version: '1.0.0' });

    try {
      await legacyClient.connect(serverTransport());
      expect(legacyClient.getProtocolEra()).toBe('legacy');

      const tools = await legacyClient.listTools();
      expect(tools.tools.map(({ name }) => name).sort()).toEqual(TOOL_NAMES);
    } finally {
      await legacyClient.close();
    }
  }, 30_000);

  it('rejects a pinned unsupported revision instead of falling back', async () => {
    const pinnedClient = new Client(
      { name: 'pinned-negotiation-client', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2099-01-01' } } }
    );

    try {
      let rejection: unknown;
      try {
        await pinnedClient.connect(serverTransport());
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(UnsupportedProtocolVersionError);
      expect(rejection).toMatchObject({
        code: ProtocolErrorCode.UnsupportedProtocolVersion,
        data: {
          requested: '2099-01-01',
          supported: expect.arrayContaining(['2026-07-28']),
        },
      });
      expect(pinnedClient.getProtocolEra()).toBeUndefined();
    } finally {
      await pinnedClient.close();
    }
  }, 30_000);
});

describe('quality-metrics createServer factory', () => {
  it('registers every tool on a fresh in-process instance', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'in-process-client', version: '1.0.0' });

    try {
      await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);

      const tools = await client.listTools();
      expect(tools.tools.map(({ name }) => name).sort()).toEqual(TOOL_NAMES);
    } finally {
      await client.close();
    }
  });

  it('returns a distinct instance per call, as serveStdio requires', () => {
    expect(createServer()).not.toBe(createServer());
  });
});
