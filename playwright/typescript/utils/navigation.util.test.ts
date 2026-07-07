import { rejects, strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  expectTitleNavigationReady,
  type TitleNavigationPage,
  type TitleNavigationResponse,
} from './navigation.util.ts';

function response(ok: boolean, status: number): TitleNavigationResponse {
  return { ok: () => ok, status: () => status };
}

function pageReturning(nextResponse: TitleNavigationResponse | null): {
  calls: { url: string; options: { waitUntil: 'commit' } }[];
  page: TitleNavigationPage;
} {
  const calls: { url: string; options: { waitUntil: 'commit' } }[] = [];

  return {
    calls,
    page: {
      async goto(url, options) {
        calls.push({ url, options });
        return nextResponse;
      },
    },
  };
}

describe('expectTitleNavigationReady', () => {
  test('waits only for navigation commit before title assertions run', async () => {
    const { calls, page } = pageReturning(response(true, 200));

    await expectTitleNavigationReady(page, '/zone/hits/');

    assert.deepEqual(calls, [{ url: '/zone/hits/', options: { waitUntil: 'commit' } }]);
  });

  test('fails clearly when navigation has no response', async () => {
    const { page } = pageReturning(null);

    await rejects(
      expectTitleNavigationReady(page, '/zone/hits/'),
      /returned no navigation response/
    );
  });

  test('fails clearly when navigation returns a non-OK response', async () => {
    const { page } = pageReturning(response(false, 500));

    await rejects(expectTitleNavigationReady(page, '/zone/hits/'), /HTTP status/);
  });
});
