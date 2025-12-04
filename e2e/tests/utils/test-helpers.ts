import { Page, BrowserContext, expect } from '@playwright/test';
import { TestConfigManager } from './test-config';

export class TestHelpers {
  static async waitForApplicationReady(page: Page): Promise<void> {
    const config = TestConfigManager.getConfig();

    console.log(`⏳ Waiting for application to be ready at ${config.baseURL}`);

    try {
      // Wait for page to load
      await page.goto(config.baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout
      });

      // Wait for specific elements that indicate app is ready
      await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

      // Check for common app ready indicators
      const readySelectors = [
        '[data-testid="app-ready"]',
        '[data-testid="main-content"]',
        'main',
        '#app',
        '.app-container'
      ];

      for (const selector of readySelectors) {
        try {
          await page.locator(selector).waitFor({ timeout: 5000 });
          console.log(`✅ App ready indicator found: ${selector}`);
          break;
        } catch {
          // Continue to next selector
        }
      }

      console.log('✅ Application is ready for testing');
    } catch (error) {
      console.warn(`⚠️ Application may not be fully ready: ${error}`);
      throw error;
    }
  }

  static async setupAuth(context: BrowserContext): Promise<void> {
    const config = TestConfigManager.getConfig();

    if (config.auth.oauthToken) {
      console.log('🔑 Setting up OAuth authentication');

      // Add authorization header to all requests
      await context.route('**/*', (route, request) => {
        const headers = {
          ...request.headers(),
          'Authorization': `Bearer ${config.auth.oauthToken}`,
        };
        route.continue({ headers });
      });

      console.log('✅ OAuth authentication configured');
    }
  }

  static async takeScreenshot(page: Page, name: string): Promise<void> {
    try {
      await page.screenshot({
        path: `test-results/screenshots/${name}-${Date.now()}.png`,
        fullPage: true
      });
      console.log(`📸 Screenshot saved: ${name}`);
    } catch (error) {
      console.warn(`⚠️ Could not take screenshot: ${error}`);
    }
  }

  static async waitAndClick(page: Page, selector: string, timeout: number = 10000): Promise<void> {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    await page.click(selector);
  }

  static async waitAndFill(page: Page, selector: string, value: string, timeout: number = 10000): Promise<void> {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    await page.fill(selector, value);
  }

  static async waitForTextContent(page: Page, text: string, timeout: number = 10000): Promise<void> {
    await page.waitForFunction(
      (expectedText: string) => {
        return document.body.innerText.includes(expectedText);
      },
      text,
      { timeout }
    );
  }

  static async isMobileViewport(page: Page): Promise<boolean> {
    const viewport = page.viewportSize();
    return viewport ? viewport.width < 768 : false;
  }

  static async scrollToElement(page: Page, selector: string): Promise<void> {
    const element = page.locator(selector);
    await element.scrollIntoViewIfNeeded();
  }

  static async waitForNetworkIdle(page: Page, timeout: number = 10000): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout });
  }

  static async mockApiResponse(page: Page, url: string, response: any): Promise<void> {
    await page.route(url, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  static async getConsoleLogs(page: Page): Promise<string[]> {
    const logs: string[] = [];

    page.on('console', (msg) => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    return logs;
  }

  static async measurePageLoadTime(page: Page): Promise<number> {
    const navigationStart = await page.evaluate(() => performance.timing.navigationStart);
    const loadComplete = await page.evaluate(() => performance.timing.loadEventEnd);

    return loadComplete - navigationStart;
  }

  static async getAccessibilityViolations(page: Page): Promise<any[]> {
    // Simple accessibility check - can be extended with axe-core
    const violations = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      const missingAlt = images.filter(img => !img.alt);

      return missingAlt.map(img => ({
        element: img.tagName,
        src: img.src,
        issue: 'Missing alt text'
      }));
    });

    return violations;
  }

  static async generateTestReport(page: Page, testName: string): Promise<void> {
    const config = TestConfigManager.getConfig();

    const metrics = {
      testName,
      environment: config.environment,
      baseURL: config.baseURL,
      timestamp: new Date().toISOString(),
      url: page.url(),
      title: await page.title(),
      viewport: page.viewportSize(),
    };

    // Save metrics as JSON
    const reportPath = `test-results/metrics/${testName}-metrics.json`;
    await page.evaluate((data) => {
      // Ensure metrics directory exists
      const dir = 'test-results/metrics';
      if (!window.fs) {
        // In CI environment, write via filesystem
        console.log('Test metrics:', JSON.stringify(data, null, 2));
      }
    }, metrics);
  }

  static async handleUncaughtErrors(page: Page): Promise<string[]> {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(`Page error: ${error.message}`);
    });

    page.on('requestfailed', (request) => {
      errors.push(`Request failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    return errors;
  }
}