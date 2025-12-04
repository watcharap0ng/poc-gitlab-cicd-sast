import { Page, expect } from '@playwright/test';
import { TestHelpers } from '../utils/test-helpers';
import { TestConfigManager } from '../utils/test-config';

export abstract class BasePage {
  protected page: Page;
  protected config = TestConfigManager.getConfig();

  constructor(page: Page) {
    this.page = page;
  }

  abstract getUrl(): string;

  async navigate(): Promise<void> {
    const url = `${this.config.baseURL}${this.getUrl()}`;
    console.log(`🌐 Navigating to: ${url}`);

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.timeout
    });

    await this.waitForPageLoad();
  }

  protected async waitForPageLoad(): Promise<void> {
    // Wait for page specific load indicators
    await this.page.waitForLoadState('networkidle', { timeout: 10000 });
  }

  async isLoaded(): Promise<boolean> {
    const url = `${this.config.baseURL}${this.getUrl()}`;
    return this.page.url().includes(this.getUrl());
  }

  async waitForElement(selector: string, timeout: number = 10000): Promise<void> {
    await this.page.waitForSelector(selector, {
      timeout,
      state: 'visible'
    });
  }

  async clickElement(selector: string, timeout: number = 10000): Promise<void> {
    await TestHelpers.waitAndClick(this.page, selector, timeout);
  }

  async fillInput(selector: string, value: string, timeout: number = 10000): Promise<void> {
    await TestHelpers.waitAndFill(this.page, selector, value, timeout);
  }

  async getTextContent(selector: string): Promise<string> {
    const element = await this.page.waitForSelector(selector);
    return await element.textContent() || '';
  }

  async isElementVisible(selector: string): Promise<boolean> {
    try {
      const element = await this.page.locator(selector).first();
      return await element.isVisible();
    } catch {
      return false;
    }
  }

  async isElementEnabled(selector: string): Promise<boolean> {
    try {
      const element = await this.page.locator(selector).first();
      return await element.isEnabled();
    } catch {
      return false;
    }
  }

  async waitForText(text: string, timeout: number = 10000): Promise<void> {
    await TestHelpers.waitForTextContent(this.page, text, timeout);
  }

  async scrollTo(selector: string): Promise<void> {
    await TestHelpers.scrollToElement(this.page, selector);
  }

  async takeScreenshot(name: string): Promise<void> {
    await TestHelpers.takeScreenshot(this.page, `${this.constructor.name}-${name}`);
  }

  async waitForNetworkIdle(timeout: number = 10000): Promise<void> {
    await TestHelpers.waitForNetworkIdle(this.page, timeout);
  }

  async verifyPageTitle(expectedTitle: string): Promise<void> {
    const title = await this.page.title();
    expect(title).toContain(expectedTitle);
  }

  async verifyUrlContains(expectedPath: string): Promise<void> {
    const url = this.page.url();
    expect(url).toContain(expectedPath);
  }

  async verifyElementVisible(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeVisible();
  }

  async verifyElementHidden(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeHidden();
  }

  async verifyTextVisible(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  async mockApiResponse(url: string, response: any): Promise<void> {
    await TestHelpers.mockApiResponse(this.page, url, response);
  }

  async getConsoleErrors(): Promise<string[]> {
    return await TestHelpers.getConsoleLogs(this.page);
  }

  async getPageLoadTime(): Promise<number> {
    return await TestHelpers.measurePageLoadTime(this.page);
  }

  async checkAccessibility(): Promise<any[]> {
    return await TestHelpers.getAccessibilityViolations(this.page);
  }

  async generateTestReport(): Promise<void> {
    await TestHelpers.generateTestReport(this.page, this.constructor.name);
  }

  // Common navigation helpers
  async goHome(): Promise<void> {
    await this.page.goto(this.config.baseURL);
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
  }

  async goBack(): Promise<void> {
    await this.page.goBack({ waitUntil: 'domcontentloaded' });
  }

  async goForward(): Promise<void> {
    await this.page.goForward({ waitUntil: 'domcontentloaded' });
  }
}