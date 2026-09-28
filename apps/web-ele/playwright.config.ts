import type { PlaywrightTestConfig } from '@playwright/test';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { devices } from '@playwright/test';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(rootDir, 'e2e/.auth/user.json');

const config: PlaywrightTestConfig = {
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  globalSetup: path.join(rootDir, 'e2e/global-setup.ts'),
  globalTeardown: path.join(rootDir, 'e2e/global-teardown.ts'),
  outputDir: 'node_modules/.e2e/test-results/',
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
    },
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: 'node_modules/.e2e/html-report', open: 'never' }],
  ],
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  timeout: 90_000,
  use: {
    actionTimeout: 15_000,
    baseURL: 'http://127.0.0.1:5777',
    headless: !!process.env.CI || process.env.E2E_HEADED !== '1',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.CI
      ? 'pnpm preview --host 127.0.0.1 --port 5777'
      : 'pnpm dev --host 127.0.0.1 --port 5777',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    url: 'http://127.0.0.1:5777',
  },
  workers: 1,
};

export default config;
