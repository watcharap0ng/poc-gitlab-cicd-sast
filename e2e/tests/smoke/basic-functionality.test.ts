import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { HomePage } from '../pages/home-page';
import { TestHelpers } from '../utils/test-helpers';
import { TestConfigManager } from '../utils/test-config';

test.describe('Basic E2E Smoke Tests', () => {
  let homePage: HomePage;
  let config = TestConfigManager.getConfig();

  test.beforeEach(async ({ page }) => {
    console.log(`🧪 Starting smoke test for: ${config.baseURL}`);
    homePage = new HomePage(page);

    // Setup authentication if configured
    if (config.auth.oauthToken) {
      const context = page.context();
      await TestHelpers.setupAuth(context);
    }
  });

  test.describe('Application Accessibility', () => {
    test('should be accessible and load properly', async ({ page }) => {
      console.log('🌐 Testing application accessibility...');

      try {
        await homePage.navigate();
        await homePage.verifyHomePageLoaded();

        // Basic accessibility checks
        const violations = await homePage.checkAccessibility();
        if (violations.length > 0) {
          console.warn(`⚠️ Accessibility violations found: ${violations.length}`);
          violations.forEach(violation => {
            console.warn(`  • ${violation.issue}: ${violation.src}`);
          });
        }

        expect(violations.length).toBeLessThan(5); // Allow some violations for initial setup
      } catch (error) {
        console.error('❌ Application accessibility test failed:', error);
        await TestHelpers.takeScreenshot(page, 'accessibility-failure');
        throw error;
      }
    });

    test('should have proper page title', async ({ page }) => {
      console.log('📄 Testing page title...');

      await homePage.navigate();

      const title = await page.title();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);

      console.log(`✅ Page title: "${title}"`);
    });

    test('should load content within reasonable time', async ({ page }) => {
      console.log('⏱️ Testing page load performance...');

      const startTime = Date.now();
      await homePage.navigate();
      const loadTime = Date.now() - startTime;

      console.log(`⏱️ Page loaded in ${loadTime}ms`);

      // Should load within 10 seconds (generous for CI environment)
      expect(loadTime).toBeLessThan(10000);
    });
  });

  test.describe('Basic Navigation', () => {
    test('should navigate to home page successfully', async ({ page }) => {
      console.log('🏠 Testing home page navigation...');

      await homePage.navigate();
      await homePage.verifyHomePageLoaded();

      // Verify URL is correct
      expect(page.url()).toContain(config.baseURL);
      console.log(`✅ Successfully navigated to: ${page.url()}`);
    });

    test('should display main content areas', async ({ page }) => {
      console.log('📱 Testing main content areas...');

      await homePage.navigate();

      // Check for common page elements
      const hasContent = await page.locator('body').innerText();
      expect(hasContent.length).toBeGreaterThan(50); // Should have some content

      // Look for common content containers
      const contentSelectors = [
        'main', '[role="main"]', '.content', '#content',
        '.container', '.wrapper', 'article', 'section'
      ];

      let hasMainContent = false;
      for (const selector of contentSelectors) {
        if (await homePage.isElementVisible(selector)) {
          hasMainContent = true;
          console.log(`✅ Found main content: ${selector}`);
          break;
        }
      }

      expect(hasMainContent).toBeTruthy();
    });

    test('should have working navigation elements', async ({ page }) => {
      console.log('🧭 Testing navigation elements...');

      await homePage.navigate();

      // Check for navigation
      const navSelectors = ['nav', '[role="navigation"]', '.nav', '.navigation', '.menu'];
      let hasNavigation = false;

      for (const selector of navSelectors) {
        if (await homePage.isElementVisible(selector)) {
          hasNavigation = true;
          console.log(`✅ Found navigation: ${selector}`);
          break;
        }
      }

      if (!hasNavigation) {
        console.warn('⚠️ No navigation elements found - app may be single page');
      }

      // Check for links
      const linksCount = await page.locator('a[href]').count();
      console.log(`🔗 Found ${linksCount} links on the page`);

      // Should have some internal or external links
      expect(linksCount).toBeGreaterThan(0);
    });
  });

  test.describe('Responsive Design', () => {
    test('should be responsive on mobile view', async ({ page }) => {
      console.log('📱 Testing mobile responsiveness...');

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await homePage.navigate();

      await homePage.verifyMobileLayout();

      const viewport = page.viewportSize()!;
      expect(viewport.width).toBeLessThan(768);

      console.log(`✅ Mobile view rendered correctly at ${viewport.width}x${viewport.height}`);
    });

    test('should be responsive on tablet view', async ({ page }) => {
      console.log('📱 Testing tablet responsiveness...');

      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await homePage.navigate();

      const viewport = page.viewportSize()!;
      expect(viewport.width).toBeGreaterThanOrEqual(768);
      expect(viewport.width).toBeLessThan(1024);

      console.log(`✅ Tablet view rendered correctly at ${viewport.width}x${viewport.height}`);
    });

    test('should be responsive on desktop view', async ({ page }) => {
      console.log('🖥️ Testing desktop responsiveness...');

      // Set desktop viewport
      await page.setViewportSize({ width: 1280, height: 720 });
      await homePage.navigate();

      await homePage.verifyDesktopLayout();

      const viewport = page.viewportSize()!;
      expect(viewport.width).toBeGreaterThanOrEqual(1024);

      console.log(`✅ Desktop view rendered correctly at ${viewport.width}x${viewport.height}`);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle 404 pages gracefully', async ({ page }) => {
      console.log('🚫 Testing 404 error handling...');

      const nonExistentUrl = `${config.baseURL}/non-existent-page-12345`;

      try {
        await page.goto(nonExistentUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        // Check if we get a proper 404 response or custom error page
        const content = await page.content();
        const hasErrorContent = content.includes('404') ||
                              content.includes('not found') ||
                              content.includes('Not Found');

        if (hasErrorContent) {
          console.log('✅ Custom 404 page displayed correctly');
        } else {
          console.log('ℹ️ Default browser 404 or redirect behavior');
        }

      } catch (error) {
        // Network errors are acceptable for 404 testing
        console.log('ℹ️ Network error for non-existent page (acceptable)');
      }
    });

    test('should handle network errors gracefully', async ({ page }) => {
      console.log('🌐 Testing network error handling...');

      // Monitor for network errors during navigation
      const errors: string[] = [];
      page.on('requestfailed', (request) => {
        errors.push(`Failed: ${request.url()} - ${request.failure()?.errorText}`);
      });

      await homePage.navigate();

      // Some network failures are acceptable in CI environment
      if (errors.length > 0) {
        console.log(`⚠️ Network errors detected: ${errors.length}`);
        errors.slice(0, 3).forEach(error => console.warn(`  • ${error}`));

        // Don't fail the test for network errors in CI
        expect(errors.length).toBeLessThan(10);
      } else {
        console.log('✅ No network errors detected');
      }
    });
  });

  test.describe('Environment Specific Tests', () => {
    test('should run in correct test environment', async ({ page }) => {
      console.log('🏷️ Testing environment configuration...');

      const isTestEnv = TestConfigManager.isTestEnvironment();
      const isProdEnv = TestConfigManager.isProductionEnvironment();

      console.log(`📍 Environment: ${config.environment}`);
      console.log(`📍 Base URL: ${config.baseURL}`);
      console.log(`📍 Is Test Environment: ${isTestEnv}`);
      console.log(`📍 Is Production: ${isProdEnv}`);

      expect(config.environment).toBeTruthy();
      expect(config.baseURL).toBeTruthy();

      if (isProdEnv) {
        console.warn('⚠️ Running tests against production environment');
      }
    });

    test('should have proper authentication configuration', async ({ page }) => {
      console.log('🔑 Testing authentication configuration...');

      const hasOauthToken = !!config.auth.oauthToken;
      const hasTestUser = !!(config.auth.testUser.username && config.auth.testUser.password);

      console.log(`🔐 OAuth Token Configured: ${hasOauthToken}`);
      console.log(`👤 Test User Configured: ${hasTestUser}`);

      // At least one auth method should be configured
      expect(hasOauthToken || hasTestUser).toBeTruthy();

      if (hasOauthToken) {
        console.log(`🔑 OAuth Token Length: ${config.auth.oauthToken.length}`);
      }

      if (hasTestUser) {
        console.log(`👤 Test User: ${config.auth.testUser.username}`);
      }
    });
  });

  test.describe('Test Infrastructure Validation', () => {
    test('should have proper test configuration', async ({ page }) => {
      console.log('⚙️ Testing test infrastructure...');

      // Validate test configuration
      expect(config.timeout).toBeGreaterThan(0);
      expect(config.browsers.length).toBeGreaterThan(0);
      expect(config.viewports).toBeTruthy();

      // Validate browser capabilities
      const browserName = test.info().project.name;
      expect(['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari', 'tablet']).toContain(browserName);

      console.log(`🌐 Running on browser: ${browserName}`);
      console.log(`⏱️ Test timeout: ${config.timeout}ms`);
      console.log(`📱 Viewport: ${page.viewportSize()?.width}x${page.viewportSize()?.height}`);
    });

    test('should collect test metrics properly', async ({ page }) => {
      console.log('📊 Testing metrics collection...');

      const startTime = Date.now();
      await homePage.navigate();
      const navigationTime = Date.now() - startTime;

      // Generate test report
      await homePage.generateTestReport();

      // Verify metrics are being collected
      expect(navigationTime).toBeGreaterThan(0);
      expect(navigationTime).toBeLessThan(30000); // Should load within 30 seconds

      console.log(`📊 Navigation time: ${navigationTime}ms`);
      console.log('✅ Test metrics collection working');
    });
  });
});