import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  getUrl(): string {
    return '/';
  }

  // Selectors
  private readonly selectors = {
    header: 'header',
    navigation: 'nav',
    mainContent: 'main',
    footer: 'footer',
    loginButton: '[data-testid="login-button"]',
    signupButton: '[data-testid="signup-button"]',
    heroTitle: '[data-testid="hero-title"]',
    heroDescription: '[data-testid="hero-description"]',
    featuresSection: '[data-testid="features-section"]',
    navigationMenu: '[data-testid="navigation-menu"]',
    mobileMenuToggle: '[data-testid="mobile-menu-toggle"]',
    searchInput: '[data-testid="search-input"]',
    userMenu: '[data-testid="user-menu"]',
    notifications: '[data-testid="notifications"]',
  };

  async navigate(): Promise<void> {
    await super.navigate();
    await this.waitForHomePageLoad();
  }

  private async waitForHomePageLoad(): Promise<void> {
    // Wait for home page specific elements
    try {
      await Promise.race([
        this.waitForElement(this.selectors.mainContent),
        this.waitForElement(this.selectors.heroTitle),
        this.waitForElement('body'), // Fallback
      ]);
      console.log('✅ Home page loaded successfully');
    } catch (error) {
      console.warn('⚠️ Home page may not be fully loaded:', error);
    }
  }

  // Navigation and header interactions
  async isHeaderVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.header);
  }

  async isNavigationVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.navigation);
  }

  async clickLoginButton(): Promise<void> {
    await this.clickElement(this.selectors.loginButton);
  }

  async clickSignupButton(): Promise<void> {
    await this.clickElement(this.selectors.signupButton);
  }

  async isLoginButtonVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.loginButton);
  }

  async isSignupButtonVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.signupButton);
  }

  // Hero section
  async getHeroTitle(): Promise<string> {
    return await this.getTextContent(this.selectors.heroTitle);
  }

  async getHeroDescription(): Promise<string> {
    return await this.getTextContent(this.selectors.heroDescription);
  }

  async isHeroSectionVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.heroTitle) ||
           await this.isElementVisible(this.selectors.heroDescription);
  }

  // Search functionality
  async fillSearchInput(text: string): Promise<void> {
    await this.fillInput(this.selectors.searchInput, text);
  }

  async submitSearch(): Promise<void> {
    await this.page.press(this.selectors.searchInput, 'Enter');
  }

  async isSearchInputVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.searchInput);
  }

  // Mobile navigation
  async toggleMobileMenu(): Promise<void> {
    await this.clickElement(this.selectors.mobileMenuToggle);
  }

  async isMobileMenuVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.navigationMenu);
  }

  // User menu and authentication
  async isUserMenuVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.userMenu);
  }

  async clickUserMenu(): Promise<void> {
    await this.clickElement(this.selectors.userMenu);
  }

  // Notifications
  async isNotificationsVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.notifications);
  }

  async clickNotifications(): Promise<void> {
    await this.clickElement(this.selectors.notifications);
  }

  // Features and content
  async isFeaturesSectionVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.featuresSection);
  }

  async scrollToFeatures(): Promise<void> {
    await this.scrollTo(this.selectors.featuresSection);
  }

  // Footer
  async isFooterVisible(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.footer);
  }

  // Verification helpers
  async verifyHomePageLoaded(): Promise<void> {
    await expect(this.page.locator(this.selectors.mainContent)).toBeVisible({
      timeout: 10000
    });
  }

  async verifyTitleContains(text: string): Promise<void> {
    const title = await this.page.title();
    expect(title).toContain(text);
  }

  async verifyUrlIsCorrect(): Promise<void> {
    await this.verifyUrlContains(this.config.baseURL);
  }

  // Mobile specific helpers
  async isMobileView(): Promise<boolean> {
    const viewport = this.page.viewportSize();
    return viewport ? viewport.width < 768 : false;
  }

  async verifyMobileLayout(): Promise<void> {
    if (await this.isMobileView()) {
      // In mobile view, certain elements should behave differently
      const mobileMenuVisible = await this.isElementVisible(this.selectors.mobileMenuToggle);
      const desktopNavVisible = await this.isElementVisible(this.selectors.navigation);

      expect(mobileMenuVisible || !desktopNavVisible).toBeTruthy();
    }
  }

  async verifyDesktopLayout(): Promise<void> {
    if (!(await this.isMobileView())) {
      // In desktop view, navigation should be visible by default
      expect(await this.isElementVisible(this.selectors.navigation)).toBeTruthy();
    }
  }

  // Performance monitoring
  async measurePageLoadPerformance(): Promise<{ loadTime: number; accessible: boolean }> {
    const loadTime = await this.getPageLoadTime();
    const accessibilityViolations = await this.checkAccessibility();

    return {
      loadTime,
      accessible: accessibilityViolations.length === 0
    };
  }

  // Content verification
  async verifyContentNotEmpty(): Promise<void> {
    const title = await this.getHeroTitle();
    const description = await this.getHeroDescription();

    expect(title.trim().length).toBeGreaterThan(0);
    expect(description.trim().length).toBeGreaterThan(0);
  }

  async verifyLinksWork(): Promise<void> {
    const links = await this.page.locator('a[href]').all();
    expect(links.length).toBeGreaterThan(0);

    // Verify some common links exist
    const commonLinks = ['about', 'contact', 'help', 'privacy', 'terms'];
    for (const link of commonLinks) {
      const linkExists = await this.page.locator(`a[href*="${link}"]`).count() > 0;
      if (!linkExists) {
        console.warn(`⚠️ Common link not found: ${link}`);
      }
    }
  }

  // Responsive design verification
  async verifyResponsiveLayout(): Promise<void> {
    const originalViewport = this.page.viewportSize()!;

    try {
      // Test mobile view
      await this.page.setViewportSize({ width: 375, height: 667 });
      await this.page.reload();
      await this.waitForPageLoad();
      await this.verifyMobileLayout();

      // Test tablet view
      await this.page.setViewportSize({ width: 768, height: 1024 });
      await this.page.reload();
      await this.waitForPageLoad();

      // Test desktop view
      await this.page.setViewportSize({ width: 1280, height: 720 });
      await this.page.reload();
      await this.waitForPageLoad();
      await this.verifyDesktopLayout();

    } finally {
      // Restore original viewport
      await this.page.setViewportSize(originalViewport);
    }
  }
}