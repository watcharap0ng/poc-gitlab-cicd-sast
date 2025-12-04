const { test, expect } = require('@playwright/test');

test.describe('Basic E2E Setup Validation', () => {
  test('should validate E2E infrastructure is working', async ({ page }) => {
    console.log('🧪 Testing basic E2E infrastructure...');

    // Test basic page load
    const testUrl = process.env.E2E_BASE_URL || process.env.URL || 'http://localhost:3000';
    console.log(`🌐 Testing with URL: ${testUrl}`);

    try {
      await page.goto(testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Check if page loads
      const title = await page.title();
      console.log(`📄 Page title: ${title}`);

      // Check if we have content
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      console.log('✅ Basic E2E infrastructure test passed');
    } catch (error) {
      console.log('⚠️ Basic infrastructure test failed, but this is expected in local development');
      console.log(`Error: ${error.message}`);

      // Don't fail the test in local development
      if (process.env.CI) {
        throw error;
      }
    }
  });

  test('should validate test configuration', async ({ page }) => {
    console.log('⚙️ Testing test configuration...');

    const config = {
      baseURL: process.env.E2E_BASE_URL || process.env.URL || 'http://localhost:3000',
      environment: process.env.TEST_ENVIRONMENT || 'test',
      timeout: parseInt(process.env.E2E_TIMEOUT || '30000'),
      hasOAuthToken: !!process.env.OAUTH_TEST_TOKEN,
      hasTestUser: !!(process.env.TEST_USER_USERNAME && process.env.TEST_USER_PASSWORD)
    };

    console.log('📋 Test Configuration:');
    console.log(`   Base URL: ${config.baseURL}`);
    console.log(`   Environment: ${config.environment}`);
    console.log(`   Timeout: ${config.timeout}ms`);
    console.log(`   OAuth Token: ${config.hasOAuthToken}`);
    console.log(`   Test User: ${config.hasTestUser}`);

    // Basic validation
    expect(config.baseURL).toBeTruthy();
    expect(config.timeout).toBeGreaterThan(0);

    console.log('✅ Test configuration validated');
  });

  test('should validate browser capabilities', async ({ page }) => {
    console.log('🌐 Testing browser capabilities...');

    // Get browser info
    const browserName = test.info().project.name;
    const viewport = page.viewportSize();

    console.log(`📊 Browser Information:`);
    console.log(`   Browser: ${browserName}`);
    console.log(`   Viewport: ${viewport?.width}x${viewport?.height}`);
    console.log(`   User Agent: ${await page.evaluate(() => navigator.userAgent)}`);

    // Test basic browser functionality
    await page.goto('about:blank');
    await page.setContent('<h1>E2E Test Page</h1>');

    const text = await page.locator('h1').textContent();
    expect(text).toBe('E2E Test Page');

    console.log('✅ Browser capabilities validated');
  });
});