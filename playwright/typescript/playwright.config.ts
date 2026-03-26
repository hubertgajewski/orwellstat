import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const BASE_URLS: Record<string, string> = {
  production: 'https://orwellstat.hubertgajewski.com',
  staging: 'https://stage.orwellstat.hubertgajewski.com',
};

const env = process.env.ENV ?? 'production';
if (!(env in BASE_URLS)) {
  throw new Error(`Unknown ENV "${env}". Accepted values: ${Object.keys(BASE_URLS).join(', ')}`);
}
const baseURL = BASE_URLS[env];

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? '100%' : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['blob'],
    // Emit GitHub check annotations on CI so failing tests surface inline in the PR Checks tab
    ...(process.env.CI ? ([['github']] as ['github'][]) : []),
  ],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  // Include OS platform in snapshot filenames so macOS and Linux each have their own baselines.
  // To generate Linux baselines, trigger the "Update visual baselines" workflow_dispatch job.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    ...(process.env.BASIC_AUTH_USER
      ? {
          httpCredentials: {
            username: process.env.BASIC_AUTH_USER,
            password: process.env.BASIC_AUTH_PASSWORD ?? '',
          },
        }
      : {}),
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      testDir: '.',
    },
    {
      name: 'Chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: new URL('.auth/user.json', import.meta.url).pathname,
      },
      dependencies: ['setup'],
    },
    {
      name: 'Firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: new URL('.auth/user.json', import.meta.url).pathname,
      },
      dependencies: ['setup'],
    },
    {
      name: 'Webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: new URL('.auth/user.json', import.meta.url).pathname,
      },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Galaxy S24'],
        storageState: new URL('.auth/user.json', import.meta.url).pathname,
      },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 15'],
        storageState: new URL('.auth/user.json', import.meta.url).pathname,
      },
      dependencies: ['setup'],
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
