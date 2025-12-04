# E2E Testing with Playwright

This directory contains end-to-end tests using Playwright for the Node.js application.

## 🏗️ Project Structure

```
e2e/
├── tests/
│   ├── smoke/                    # Smoke tests for basic functionality
│   ├── authentication/          # Authentication and authorization tests
│   ├── mobile/                   # Mobile-specific tests
│   ├── pages/                    # Page Object Models
│   ├── utils/                    # Test utilities and helpers
│   └── fixtures/                 # Test data and fixtures
├── scripts/                      # Setup and cleanup scripts
├── config/                       # Configuration files
├── test-results/                 # Test results and artifacts
├── playwright-report/            # HTML test reports
├── package.json                  # Dependencies and scripts
├── playwright.config.ts          # Playwright configuration
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker (for CI/CD)

### Installation

```bash
# Navigate to E2E directory
cd e2e

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Running Tests

```bash
# Run all tests
npm run test:e2e

# Run specific tests
npm run test:e2e -- --grep "smoke"

# Run on specific browser
npm run test:e2e:chrome
npm run test:e2e:firefox
npm run test:e2e:safari

# Run mobile tests
npm run test:e2e:mobile

# Run tests in debug mode
npm run test:e2e:debug

# Generate new tests with codegen
npm run test:e2e:codegen

# View HTML report
npm run test:e2e:show-report
```

## 🔧 Configuration

### Environment Variables

```bash
# Required
E2E_BASE_URL=https://your-app-url.com
TEST_ENVIRONMENT=test|demo|production

# Optional
E2E_TIMEOUT=30000                    # Test timeout in milliseconds
E2E_BROWSER=all|chromium|firefox|webkit # Target browser

# Authentication
OAUTH_TEST_TOKEN=your-oauth-token
TEST_USER_USERNAME=testuser@example.com
TEST_USER_PASSWORD=testpassword123

# Database
TEST_DATABASE_URL=postgresql://user:pass@host:port/db
```

### Playwright Configuration

The main configuration is in `playwright.config.ts`:

- **Browsers**: Chromium, Firefox, WebKit (Safari)
- **Viewports**: Desktop, Mobile, Tablet
- **Timeouts**: 30 seconds default, 10 minutes global
- **Parallel Execution**: 3 workers in CI
- **Reporting**: JUnit, JSON, HTML

## 📱 Cross-Browser Testing

Tests run across multiple browsers automatically:

### Desktop Browsers
- **Chromium** (Chrome/Edge)
- **Firefox**
- **WebKit** (Safari)

### Mobile Devices
- **Mobile Chrome** (Android)
- **Mobile Safari** (iOS)

### Tablet
- **iPad** (iOS Safari)

## 🔐 Authentication Testing

Supports multiple authentication methods:

### Token-Based Authentication
```typescript
const config = TestConfigManager.getConfig();
if (config.auth.oauthToken) {
  await TestHelpers.setupAuth(context);
}
```

### Form-Based Authentication
```typescript
await loginPage.loginWithCredentials(username, password);
```

### OAuth2 Testing
```typescript
await loginPage.loginWithOAuth(oauthProvider);
```

## 📊 Test Categories

### Smoke Tests
- Basic application accessibility
- Page load performance
- Core functionality verification

### Authentication Tests
- Public endpoint access
- Token-based authentication
- OAuth2 flow validation

### Cross-Browser Tests
- Browser compatibility
- Responsive design
- Mobile functionality

### API Tests
- Endpoint accessibility
- Response validation
- Error handling

## 🎯 Page Object Models

Organized using Page Object Model pattern:

```typescript
// Example usage
const homePage = new HomePage(page);
await homePage.navigate();
await homePage.verifyHomePageLoaded();
await homePage.clickLoginButton();
```

### Available Pages
- `HomePage` - Main landing page
- `BasePage` - Common functionality and utilities

## 🔧 Test Utilities

### TestHelpers
- Application readiness checking
- Authentication setup
- Screenshot capture
- Error handling
- Performance measurement

### TestConfigManager
- Environment configuration
- Authentication management
- Browser-specific settings

## 📦 CI/CD Integration

### GitLab CI Configuration

The E2E tests are integrated into GitLab CI with:

- **Stage**: `e2e_testing` (after deployment, before DAST)
- **Parallel Execution**: 3 jobs for cross-browser testing
- **Artifacts**: Screenshots, videos, test reports
- **Timeout**: 15 minutes per job
- **Failure Handling**: Configurable (allows failures during setup)

### Pipeline Variables

Configure these in GitLab CI/CD variables:

```bash
E2E_BASE_URL=${URL}
OAUTH_TEST_TOKEN=${OAUTH_TEST_TOKEN}
TEST_USER_USERNAME=${TEST_USER_USERNAME}
TEST_USER_PASSWORD=${TEST_USER_PASSWORD}
TEST_DATABASE_URL=${TEST_DATABASE_URL}
```

## 📈 Reporting and Artifacts

### Test Reports
- **JUnit XML**: For GitLab test reports integration
- **JSON**: Machine-readable test results
- **HTML**: Interactive test reports with screenshots

### Artifacts
- **Screenshots**: PNG images on test failure
- **Videos**: WebM recordings of test runs
- **Traces**: ZIP files for debugging
- **Metrics**: JSON files with performance data

### Example Report Structure
```
test-results/
├── screenshots/
├── videos/
├── traces/
├── junit.xml
├── results.json
└── metrics/
```

## 🛠️ Development Workflow

### Adding New Tests

1. Create test file in appropriate directory (`tests/smoke/`, `tests/authentication/`, etc.)
2. Use Page Object Models for page interactions
3. Follow naming convention: `*.test.ts`
4. Include proper assertions and error handling

### Example Test Structure
```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/home-page';

test.describe('Feature Tests', () => {
  test('should work correctly', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.navigate();
    await homePage.verifyHomePageLoaded();

    // Test implementation
  });
});
```

### Debugging Tests

```bash
# Run with debug mode
npm run test:e2e:debug

# Run specific test with debugging
npx playwright test --debug tests/smoke/basic-functionality.test.ts

# Generate code for interactions
npm run test:e2e:codegen
```

## 🐛 Troubleshooting

### Common Issues

#### Browser Installation
```bash
# Reinstall browsers
npx playwright install --with-deps
```

#### Timeouts
- Increase `E2E_TIMEOUT` environment variable
- Check application availability
- Verify network connectivity

#### Authentication Failures
- Verify `OAUTH_TEST_TOKEN` is valid
- Check `TEST_USER_USERNAME` and `TEST_USER_PASSWORD`
- Ensure test environment has proper auth configuration

#### Test Flakiness
- Add proper waits and retries
- Use specific selectors
- Check for timing issues
- Verify test data isolation

### Debug Commands

```bash
# Check Playwright installation
npx playwright --version

# List installed browsers
npx playwright install --help

# Run tests with detailed output
DEBUG=pw:* npm run test:e2e

# Run tests with trace
npx playwright test --trace on
```

## 📚 Best Practices

### Test Organization
- Group related tests in `describe` blocks
- Use meaningful test names
- Follow Page Object Model pattern
- Keep tests independent and isolated

### Performance
- Use parallel execution for faster runs
- Implement proper waits instead of fixed delays
- Optimize selectors for performance
- Use caching where appropriate

### Reliability
- Implement proper error handling
- Use explicit waits for dynamic content
- Handle network failures gracefully
- Add retry logic for flaky operations

### Maintenance
- Keep Page Object Models updated
- Regular review and refactoring
- Document complex test scenarios
- Monitor test execution times

## 🔄 Continuous Improvement

### Monitoring
- Track test execution times
- Monitor flaky test rates
- Analyze failure patterns
- Review test coverage

### Updates
- Keep Playwright updated
- Regular dependency updates
- Review and update test data
- Optimize test performance

## 📞 Support

For questions or issues:

1. Check the Playwright documentation: https://playwright.dev/
2. Review test logs and artifacts
3. Consult the troubleshooting section above
4. Check GitLab CI job logs for pipeline issues

## 📄 License

This E2E testing setup follows the same license as the main project.