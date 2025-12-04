const { defineConfig, devices } = require('@playwright/test');

// Simple configuration for initial testing
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
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Test organization
  testMatch: '**/*.test.js', // Only run JavaScript tests initially

  // Retry configuration
  retries: process.env.CI ? 2 : 0,

  // Output directory
  outputDir: 'test-results/',

  // Global setup
  globalSetup: async () => {
    console.log('🚀 E2E Test Environment Setup:');
    console.log(`   Base URL: ${process.env.E2E_BASE_URL || process.env.URL}`);
    console.log(`   Environment: ${process.env.DEPLOYMENT_NAMESPACE || 'test'}`);
    console.log(`   Browser: ${process.env.E2E_BROWSER || 'all'}`);
  },
});

module.exports = config;