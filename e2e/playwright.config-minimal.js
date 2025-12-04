const { defineConfig, devices } = require('@playwright/test');

// Minimal configuration for initial testing
const config = defineConfig({
  testDir: './tests',

  // Test configuration
  timeout: 30 * 1000, // 30 seconds
  expect: {
    timeout: 10 * 1000, // 10 seconds
  },

  // Reporter configuration
  reporter: [
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Browser configuration
  use: {
    baseURL: process.env.E2E_BASE_URL || process.env.URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Test organization
  testMatch: '**/*.test.js', // Only run JavaScript tests initially

  // Retry configuration
  retries: 0,

  // Output directory
  outputDir: 'test-results/',
});

module.exports = config;