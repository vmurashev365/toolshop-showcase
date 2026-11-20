import { defineConfig, devices } from '@playwright/test';
import { resolveEnv } from './src/config/env';

const env = resolveEnv();

/**
 * Every npm script sets its own PW_REPORT_DIR (reports/pw-api, reports/pw-mobile, ...), so running
 * several suites one after another (locally or in one CI job) never overwrites an earlier suite's
 * HTML/JSON report or its traces/videos (Playwright wipes outputDir at the start of each run).
 */
const reportDir = (process.env.PW_REPORT_DIR || 'reports/playwright').replace(/\/$/, '');

export default defineConfig({
  testDir: './tests/pw',
  outputDir: `${reportDir}/artifacts`,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The target is a shared public sandbox: ~12 parallel browsers were enough to make page.goto
  // time out, so local runs are capped too instead of using half of the CPU cores.
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: `${reportDir}/html`, open: 'never' }],
    ['json', { outputFile: `${reportDir}/results.json` }],
  ],
  use: {
    baseURL: env.uiBaseUrl,
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'api-margin-security',
      testMatch: /api\/.*\.spec\.ts/,
      grepInvert: /@known-spec-discrepancy/,
      use: {
        baseURL: env.apiBaseUrl,
      },
    },
    {
      // Inverted checks (see expectKnownDiscrepancy): green while the live defect still
      // reproduces, red once it is fixed and the test should be promoted to the regression gate.
      name: 'known-discrepancies-api',
      testMatch: /api\/.*\.spec\.ts/,
      grep: /@known-spec-discrepancy/,
      use: {
        baseURL: env.apiBaseUrl,
      },
    },
    {
      name: 'mobile-webkit',
      testMatch: /mobile\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 14'],
        baseURL: env.uiBaseUrl,
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: /mobile\/.*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        baseURL: env.uiBaseUrl,
      },
    },
    {
      name: 'ux-guards',
      testMatch: /ux\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: env.uiBaseUrl,
      },
    },
  ],
});
