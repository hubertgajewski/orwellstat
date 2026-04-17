import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type APIRequestContext } from '@fixtures/base.fixture';

const W3C_MARKUP_VALIDATOR = 'https://validator.w3.org/check';
const CSS_VALIDATOR = 'https://jigsaw.w3.org/css-validator/validator';

interface W3cMessage {
  type: 'error' | 'info' | 'non-document-error';
  message: string;
  lastLine?: number;
}

interface W3cResponse {
  messages: W3cMessage[];
}

interface CssValidationResponse {
  cssvalidation: {
    result: { errorcount: number };
    errors?: Array<{ message: string; line: number }>;
  };
}

// Default: local xmllint DTD validation. No network traffic, no authenticated HTML
// crosses the trust boundary. Remote path stays available via VALIDATE_REMOTE=true
// for a periodic "official" cross-check against validator.w3.org.
export async function expectValidXhtml(request: APIRequestContext, xhtml: string): Promise<void> {
  if (process.env.VALIDATE_REMOTE === 'true') {
    await expectValidXhtmlRemote(request, xhtml);
  } else {
    await expectValidXhtmlLocal(xhtml);
  }
}

export async function expectValidXhtmlLocal(xhtml: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'xhtml-'));
  const file = join(dir, 'page.xhtml');
  writeFileSync(file, xhtml);
  try {
    execFileSync('xmllint', ['--valid', '--noout', file], { stdio: 'pipe' });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`XHTML DTD validation failed:\n${stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function expectValidXhtmlRemote(
  request: APIRequestContext,
  xhtml: string
): Promise<void> {
  const response = await request.fetch(W3C_MARKUP_VALIDATOR, {
    method: 'POST',
    multipart: {
      uploaded_file: {
        name: 'page.xhtml',
        mimeType: 'application/xhtml+xml',
        buffer: Buffer.from(xhtml),
      },
      output: 'json',
    },
  });
  expect(response.ok(), `W3C markup validator request failed: ${response.status()}`).toBeTruthy();
  const { messages } = (await response.json()) as W3cResponse;
  const errors = messages.filter(
    (m: W3cMessage) => m.type === 'error' || m.type === 'non-document-error'
  );
  expect(
    errors,
    `XHTML validation errors:\n${errors.map((e: W3cMessage) => `  Line ${e.lastLine ?? '?'}: ${e.message}`).join('\n')}`
  ).toHaveLength(0);
}

export async function expectValidCss(request: APIRequestContext, cssUrl: string): Promise<void> {
  const response = await request.get(
    `${CSS_VALIDATOR}?output=json&uri=${encodeURIComponent(cssUrl)}`
  );
  expect(response.ok(), `CSS validator request failed: ${response.status()}`).toBeTruthy();
  const { cssvalidation } = (await response.json()) as CssValidationResponse;
  expect(
    cssvalidation.result.errorcount,
    `CSS errors in ${cssUrl}:\n${(cssvalidation.errors ?? []).map((e: { message: string; line: number }) => `  Line ${e.line}: ${e.message}`).join('\n')}`
  ).toBe(0);
}
