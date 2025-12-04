import * as fs from 'fs';
import * as path from 'path';

export interface TestConfig {
  baseURL: string;
  environment: string;
  timeout: number;
  auth: {
    oauthToken: string;
    testUser: {
      username: string;
      password: string;
    };
  };
  database?: {
    url: string;
  };
  browsers: string[];
  viewports: {
    desktop: { width: number; height: number };
    mobile: { width: number; height: number };
    tablet: { width: number; height: number };
  };
}

export class TestConfigManager {
  private static config: TestConfig | null = null;

  static getConfig(): TestConfig {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  private static loadConfig(): TestConfig {
    // Try to load from test-config.json (created during setup)
    if (fs.existsSync('test-config.json')) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync('test-config.json', 'utf8'));
        return this.mergeWithEnvVars(fileConfig);
      } catch (error) {
        console.warn('Could not load test-config.json, using environment variables');
      }
    }

    // Fallback to environment variables
    return this.mergeWithEnvVars({});
  }

  private static mergeWithEnvVars(baseConfig: any): TestConfig {
    return {
      baseURL: process.env.E2E_BASE_URL || process.env.URL || 'http://localhost:3000',
      environment: process.env.TEST_ENVIRONMENT || 'test',
      timeout: parseInt(process.env.E2E_TIMEOUT || '30000'),
      auth: {
        oauthToken: process.env.OAUTH_TEST_TOKEN || '',
        testUser: {
          username: process.env.TEST_USER_USERNAME || 'testuser@example.com',
          password: process.env.TEST_USER_PASSWORD || 'testpassword123',
        },
      },
      database: {
        url: process.env.TEST_DATABASE_URL || '',
      },
      browsers: ['chromium', 'firefox', 'webkit'],
      viewports: {
        desktop: { width: 1280, height: 720 },
        mobile: { width: 375, height: 667 },
        tablet: { width: 768, height: 1024 },
      },
      ...baseConfig,
    };
  }

  static isProductionEnvironment(): boolean {
    const env = this.getConfig().environment.toLowerCase();
    return env.includes('prod') || env.includes('production');
  }

  static isTestEnvironment(): boolean {
    const env = this.getConfig().environment.toLowerCase();
    return env.includes('test') || env.includes('demo');
  }

  static getAuthHeaders(): Record<string, string> {
    const config = this.getConfig();
    const headers: Record<string, string] = {};

    if (config.auth.oauthToken) {
      headers['Authorization'] = `Bearer ${config.auth.oauthToken}`;
    }

    return headers;
  }

  static getBrowserConfig(browser?: string) {
    const config = this.getConfig();
    const selectedBrowser = browser || process.env.E2E_BROWSER || 'chromium';

    return {
      name: selectedBrowser,
      ...config.viewports.desktop,
      ...this.getBrowserSpecificConfig(selectedBrowser),
    };
  }

  private static getBrowserSpecificConfig(browser: string) {
    switch (browser.toLowerCase()) {
      case 'firefox':
        return {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
          },
        };
      case 'webkit':
        return {
          isMobile: false,
          hasTouch: false,
        };
      case 'chromium':
      default:
        return {
          chromiumSandbox: false,
          args: [
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
          ],
        };
    }
  }
}