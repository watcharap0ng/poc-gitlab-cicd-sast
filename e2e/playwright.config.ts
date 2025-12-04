import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env' });

const config = {
  testDir: './tests',

  // Global test configuration
  timeout: 30 * 1000, // 30 seconds
  expect: {
    timeout: 10 * 1000, // 10 seconds
  },

  // Reporter configuration for CI/CD
  reporter: [
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Artifacts configuration
  use: {
    // Global base URL
    baseURL: process.env.E2E_BASE_URL || process.env.URL || 'http://localhost:3000',

    // Browser configuration
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Network and performance
    ignoreHTTPSErrors: true,

    // Viewport configuration
    viewport: { width: 1280, height: 720 },

    // Locale and timezone
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  // Browser projects configuration
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grep: new RegExp(process.env.GREP_CHROMIUM || ''),
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      grep: new RegExp(process.env.GREP_FIREFOX || ''),
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grep: new RegExp(process.env.GREP_WEBKIT || ''),
    },

    // Mobile devices
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 },
      },
      testMatch: '**/mobile/**/*.test.ts',
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 },
      },
      testMatch: '**/mobile/**/*.test.ts',
    },

    // Tablet devices
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro'],
        viewport: { width: 768, height: 1024 },
      },
      testMatch: '**/tablet/**/*.test.ts',
    },
  ],

  // Test configuration for CI environments
  webServer: process.env.CI ? [] : [
    {
      command: 'npm start',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000, // 2 minutes
    },
  ],

  // Global setup and teardown
  globalSetup: './config/global-setup.ts',
  globalTeardown: './config/global-teardown.ts',

  // Test organization
  testIgnore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/test-results/**',
    '**/playwright-report/**',
  ],

  // Retry configuration for CI
  retries: process.env.CI ? 2 : 0,

  // Worker configuration
  workers: process.env.CI ? 1 : undefined,

  // Output directory
  outputDir: 'test-results/',

  // Max test failures
  maxFailures: process.env.CI ? 10 : undefined,
};

export default config;