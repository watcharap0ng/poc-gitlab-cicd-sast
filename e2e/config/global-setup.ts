import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E Test Global Setup...');

  // Ensure test directories exist
  const testDirs = [
    'test-results',
    'test-results/screenshots',
    'test-results/videos',
    'test-results/traces',
    'playwright-report'
  ];

  testDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });

  // Setup test environment configuration
  const testConfig = {
    baseURL: process.env.E2E_BASE_URL || process.env.URL || 'http://localhost:3000',
    environment: process.env.DEPLOYMENT_NAMESPACE || 'test',
    browser: process.env.E2E_BROWSER || 'all',
    timeout: parseInt(process.env.E2E_TIMEOUT || '30000'),

    // Authentication configuration
    auth: {
      oauthToken: process.env.OAUTH_TEST_TOKEN || '',
      testUser: {
        username: process.env.TEST_USER_USERNAME || 'testuser@example.com',
        password: process.env.TEST_USER_PASSWORD || 'testpassword123'
      }
    },

    // Database configuration
    database: {
      url: process.env.TEST_DATABASE_URL || '',
    }
  };

  // Save test configuration
  fs.writeFileSync(
    path.join(process.cwd(), 'test-config.json'),
    JSON.stringify(testConfig, null, 2)
  );

  console.log('✅ Global setup completed successfully');
  console.log(`🌐 Base URL: ${testConfig.baseURL}`);
  console.log(`🏷️  Environment: ${testConfig.environment}`);

  // Verify application is ready for testing
  if (testConfig.baseURL && testConfig.baseURL !== 'http://localhost:3000') {
    console.log('🔍 Checking application availability...');
    try {
      const browser = await chromium.launch();
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.goto(testConfig.baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      if (response && response.status() < 400) {
        console.log('✅ Application is ready for testing');
      } else {
        console.warn(`⚠️  Application responded with status: ${response?.status()}`);
      }

      await browser.close();
    } catch (error) {
      console.warn(`⚠️  Could not verify application availability: ${error}`);
    }
  }

  return testConfig;
}

export default globalSetup;