export type TitleNavigationResponse = {
  ok(): boolean;
  status(): number;
};

export type TitleNavigationPage = {
  goto(
    url: string,
    options: { waitUntil: 'domcontentloaded' }
  ): Promise<TitleNavigationResponse | null>;
};

export async function expectTitleNavigationReady(
  page: TitleNavigationPage,
  url: string
): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

  if (response === null) {
    throw new Error(`${url} returned no navigation response`);
  }

  if (!response.ok()) {
    throw new Error(`${url} HTTP status ${response.status()} was not OK`);
  }
}
