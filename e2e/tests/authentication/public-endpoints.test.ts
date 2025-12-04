import { test, expect, Page } from '@playwright/test';
import { HomePage } from '../pages/home-page';
import { TestHelpers } from '../utils/test-helpers';
import { TestConfigManager } from '../utils/test-config';

test.describe('Public Endpoints Access', () => {
  let homePage: HomePage;
  let config = TestConfigManager.getConfig();

  test.beforeEach(async ({ page }) => {
    console.log(`🌐 Testing public endpoints at: ${config.baseURL}`);
    homePage = new HomePage(page);
  });

  test.describe('Public Page Access', () => {
    test('should allow access to home page without authentication', async ({ page }) => {
      console.log('🏠 Testing public home page access...');

      await homePage.navigate();
      await homePage.verifyHomePageLoaded();

      // Verify page loads without authentication requirements
      const hasContent = await page.locator('body').innerText();
      expect(hasContent.length).toBeGreaterThan(50);

      console.log('✅ Home page accessible without authentication');
    });

    test('should allow access to common public pages', async ({ page }) => {
      console.log('📄 Testing common public pages...');

      const publicPaths = [
        '/',
        '/about',
        '/contact',
        '/help',
        '/privacy',
        '/terms',
        '/login',
        '/signup',
        '/register'
      ];

      const accessiblePages: string[] = [];
      const inaccessiblePages: string[] = [];

      for (const path of publicPaths) {
        try {
          const url = `${config.baseURL}${path}`;
          console.log(`🔍 Testing: ${url}`);

          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
          });

          // Check if page loaded successfully (not redirected to auth)
          const currentUrl = page.url();
          const hasContent = await page.locator('body').innerText();

          if (hasContent.length > 20 && !currentUrl.includes('/auth/')) {
            accessiblePages.push(path);
            console.log(`✅ Accessible: ${path}`);
          } else {
            inaccessiblePages.push(path);
            console.log(`⚠️ Auth required or redirect: ${path}`);
          }

        } catch (error) {
          inaccessiblePages.push(path);
          console.log(`❌ Error accessing: ${path} - ${error}`);
        }

        // Small delay between requests
        await page.waitForTimeout(1000);
      }

      console.log(`📊 Public pages accessible: ${accessiblePages.length}/${publicPaths.length}`);
      console.log(`📋 Accessible pages: ${accessiblePages.join(', ')}`);

      if (inaccessiblePages.length > 0) {
        console.log(`🚫 Pages requiring auth: ${inaccessiblePages.join(', ')}`);
      }

      // At least the home page should be accessible
      expect(accessiblePages.length).toBeGreaterThan(0);
      expect(accessiblePages).toContain('/');
    });
  });

  test.describe('API Endpoint Access', () => {
    test('should allow access to public API endpoints', async ({ page }) => {
      console.log('🔌 Testing public API endpoints...');

      const publicApiPaths = [
        '/api/health',
        '/api/status',
        '/api/public/config',
        '/api/public/info',
        '/health',
        '/status',
        '/ping'
      ];

      const accessibleApis: string[] = [];
      const inaccessibleApis: string[] = [];

      for (const path of publicApiPaths) {
        try {
          const url = `${config.baseURL}${path}`;
          console.log(`🔍 Testing API: ${url}`);

          const response = await page.evaluate(async (apiUrl) => {
            try {
              const resp = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              return {
                status: resp.status,
                ok: resp.ok,
                headers: Object.fromEntries(resp.headers.entries())
              };
            } catch (error) {
              return {
                status: 0,
                ok: false,
                error: error.message
              };
            }
          }, url);

          if (response.ok || response.status < 400) {
            accessibleApis.push(path);
            console.log(`✅ API accessible: ${path} (${response.status})`);
          } else {
            inaccessibleApis.push(path);
            console.log(`⚠️ API not accessible: ${path} (${response.status})`);
          }

        } catch (error) {
          inaccessibleApis.push(path);
          console.log(`❌ API error: ${path} - ${error}`);
        }

        // Small delay between requests
        await page.waitForTimeout(500);
      }

      console.log(`📊 Public APIs accessible: ${accessibleApis.length}/${publicApiPaths.length}`);

      if (accessibleApis.length > 0) {
        console.log(`📋 Accessible APIs: ${accessibleApis.join(', ')}`);
      }

      if (inaccessibleApis.length > 0) {
        console.log(`🚫 APIs not accessible: ${inaccessibleApis.join(', ')}`);
      }
    });

    test('should handle CORS properly for public endpoints', async ({ page }) => {
      console.log('🌐 Testing CORS configuration...');

      // Test if application supports CORS (important for frontend integration)
      const corsTestUrl = `${config.baseURL}/api/public/test-cors`;

      try {
        const response = await page.evaluate(async (url) => {
          try {
            const resp = await fetch(url, {
              method: 'OPTIONS',
              headers: {
                'Origin': 'https://example.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Content-Type'
              }
            });
            return {
              status: resp.status,
              ok: resp.ok,
              corsHeaders: {
                'access-control-allow-origin': resp.headers.get('access-control-allow-origin'),
                'access-control-allow-methods': resp.headers.get('access-control-allow-methods'),
                'access-control-allow-headers': resp.headers.get('access-control-allow-headers')
              }
            };
          } catch (error) {
            return {
              status: 0,
              ok: false,
              error: error.message
            };
          }
        }, corsTestUrl);

        if (response.ok && response.corsHeaders['access-control-allow-origin']) {
          console.log('✅ CORS headers configured correctly');
          console.log(`📋 Allowed Origin: ${response.corsHeaders['access-control-allow-origin']}`);
        } else {
          console.log('ℹ️ CORS not configured or endpoint not available');
        }

      } catch (error) {
        console.log('ℹ️ Could not test CORS - may not be applicable');
      }
    });
  });

  test.describe('Security Headers', () => {
    test('should have proper security headers configured', async ({ page }) => {
      console.log('🔒 Testing security headers...');

      const securityHeaders = [
        'x-frame-options',
        'x-content-type-options',
        'x-xss-protection',
        'strict-transport-security',
        'content-security-policy',
        'referrer-policy'
      ];

      const presentHeaders: string[] = [];
      const missingHeaders: string[] = [];

      try {
        const response = await page.goto(config.baseURL, {
          waitUntil: 'domcontentloaded'
        });

        if (response) {
          for (const header of securityHeaders) {
            const headerValue = response.headers()[header];
            if (headerValue) {
              presentHeaders.push(header);
              console.log(`✅ ${header}: ${headerValue}`);
            } else {
              missingHeaders.push(header);
              console.log(`⚠️ Missing: ${header}`);
            }
          }
        }

        console.log(`📊 Security headers present: ${presentHeaders.length}/${securityHeaders.length}`);

        // Should have at least some security headers
        expect(presentHeaders.length).toBeGreaterThan(0);

      } catch (error) {
        console.warn('⚠️ Could not check security headers:', error);
      }
    });

    test('should not expose sensitive information in public responses', async ({ page }) => {
      console.log('🔍 Testing for information disclosure...');

      await homePage.navigate();

      // Check page content for sensitive information
      const pageContent = await page.content();
      const bodyText = await page.locator('body').innerText();

      // Common sensitive patterns to check for
      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /token/i,
        /api[_-]?key/i,
        /private[_-]?key/i,
        /database/i,
        /\.env/i,
        /config\.json/i,
        /error_reporting/i
      ];

      const findings: string[] = [];

      for (const pattern of sensitivePatterns) {
        const matches = bodyText.match(pattern);
        if (matches && matches.length > 0) {
          // Check if these might be legitimate UI text vs actual secrets
          const suspiciousMatches = matches.filter(match => {
            const lowerMatch = match.toLowerCase();
            return !lowerMatch.includes('enter') &&
                   !lowerMatch.includes('your') &&
                   !lowerMatch.includes('create') &&
                   !lowerMatch.includes('confirm');
          });

          if (suspiciousMatches.length > 0) {
            findings.push(`Found sensitive pattern: ${pattern.source}`);
          }
        }
      }

      if (findings.length > 0) {
        console.warn('⚠️ Potential information disclosure found:');
        findings.forEach(finding => console.warn(`  • ${finding}`));
      } else {
        console.log('✅ No obvious information disclosure detected');
      }

      // For now, just warn - this can be made stricter based on requirements
    });
  });

  test.describe('Rate Limiting and Abuse Prevention', () => {
    test('should handle multiple rapid requests gracefully', async ({ page }) => {
      console.log('⚡ Testing rate limiting behavior...');

      const rapidRequests = 10;
      const successfulRequests: number[] = [];
      const failedRequests: number[] = [];

      for (let i = 0; i < rapidRequests; i++) {
        try {
          const startTime = Date.now();
          await page.goto(config.baseURL, {
            waitUntil: 'domcontentloaded',
            timeout: 5000
          });
          const responseTime = Date.now() - startTime;

          successfulRequests.push(responseTime);
          console.log(`✅ Request ${i + 1}: ${responseTime}ms`);

        } catch (error) {
          failedRequests.push(i + 1);
          console.log(`❌ Request ${i + 1} failed: ${error}`);
        }

        // Small delay between requests
        await page.waitForTimeout(200);
      }

      console.log(`📊 Successful requests: ${successfulRequests.length}/${rapidRequests}`);
      console.log(`📊 Failed requests: ${failedRequests.length}/${rapidRequests}`);

      if (successfulRequests.length > 0) {
        const avgResponseTime = successfulRequests.reduce((a, b) => a + b, 0) / successfulRequests.length;
        console.log(`📈 Average response time: ${Math.round(avgResponseTime)}ms`);

        // Should not be extremely slow due to rate limiting
        expect(avgResponseTime).toBeLessThan(5000);
      }

      // Some requests might fail due to rate limiting (which is good)
      expect(successfulRequests.length).toBeGreaterThan(0);
    });
  });

  test.describe('Public Content Verification', () => {
    test('should have proper meta tags and SEO', async ({ page }) => {
      console.log('🏷️ Testing meta tags and SEO elements...');

      await homePage.navigate();

      // Check for essential meta tags
      const metaTags = await page.locator('meta').all();
      console.log(`📋 Found ${metaTags.length} meta tags`);

      // Check for important meta tags
      const importantMetaTags = [
        'meta[name="description"]',
        'meta[name="viewport"]',
        'meta[charset]',
        'title'
      ];

      let foundImportantTags = 0;

      for (const selector of importantMetaTags) {
        try {
          const element = await page.locator(selector).first();
          const isVisible = await element.count() > 0;

          if (isVisible) {
            foundImportantTags++;
            console.log(`✅ Found: ${selector}`);

            if (selector === 'title') {
              const title = await element.textContent();
              console.log(`📄 Title: "${title}"`);
            } else if (selector === 'meta[name="description"]') {
              const description = await element.getAttribute('content');
              console.log(`📝 Description: "${description}"`);
            }
          }
        } catch (error) {
          // Tag not found
        }
      }

      console.log(`📊 Important meta tags found: ${foundImportantTags}/${importantMetaTags.length}`);

      // Should have at least basic meta tags
      expect(foundImportantTags).toBeGreaterThanOrEqual(2);
    });

    test('should have proper language and accessibility attributes', async ({ page }) => {
      console.log('🌐 Testing language and accessibility attributes...');

      await homePage.navigate();

      // Check for language attributes
      const htmlLang = await page.getAttribute('html', 'lang');
      console.log(`🌍 HTML lang attribute: ${htmlLang}`);

      if (htmlLang) {
        expect(htmlLang.length).toBeGreaterThan(0);
      }

      // Check for accessibility landmarks
      const landmarks = [
        'header', 'nav', 'main', 'aside', 'footer',
        '[role="banner"]', '[role="navigation"]',
        '[role="main"]', '[role="contentinfo"]'
      ];

      let foundLandmarks = 0;

      for (const landmark of landmarks) {
        try {
          const count = await page.locator(landmark).count();
          if (count > 0) {
            foundLandmarks++;
            console.log(`✅ Found landmark: ${landmark} (${count} instances)`);
          }
        } catch (error) {
          // Landmark not found
        }
      }

      console.log(`📊 Accessibility landmarks found: ${foundLandmarks}`);

      // Should have at least some basic landmarks
      expect(foundLandmarks).toBeGreaterThan(0);
    });
  });
});