import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/playwright.xml' }],
  ],
  use: {
    baseURL: process.env.EXVO_E2E_BASE_URL || 'http://127.0.0.1:4173',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The CI browser install includes ffmpeg. Local runs may use system Chrome
    // when the bundled browser cannot fit on disk.
    video: process.env.PLAYWRIGHT_CHANNEL ? 'off' : 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'mock-chromium',
      testIgnore: '**/integration/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'integration-chromium',
      testMatch: '**/integration/**/*.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
