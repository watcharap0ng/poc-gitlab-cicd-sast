# 🕷️ DAST Standalone Scanner

A comprehensive, production-ready Dynamic Application Security Testing (DAST) scanner built for ad-hoc security testing and CI/CD integration. This standalone scanner leverages OWASP ZAP with advanced configuration, multiple authentication methods, and seamless DefectDojo integration.

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [🛡️ Features](#️-features)
- [📦 Installation](#-installation)
- [⚙️ Configuration](#️-configuration)
- [🔐 Authentication](#-authentication)
- [🚀 Usage](#-usage)
- [🔧 Advanced Configuration](#-advanced-configuration)
- [🔗 DefectDojo Integration](#-defectdojo-integration)
- [🧪 Testing](#-testing)
- [📊 Reporting](#-reporting)
- [🔒 Security Policy Validation](#-security-policy-validation)
- [🚨 Troubleshooting](#-troubleshooting)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🚀 Quick Start

### Basic Scan

```bash
# Simple scan against a target
./scripts/dast-standalone.sh https://example.com

# With verbose output
./scripts/dast-standalone.sh -v https://example.com

# Create configuration template
./scripts/dast-standalone.sh --create-config
```

### Authenticated Scan

```bash
# Form-based authentication
./scripts/dast-standalone.sh -a form -u admin -p password https://app.example.com

# Token-based authentication
./scripts/dast-standalone.sh -a token -t "eyJhbGciOiJIUzI1NiIs..." https://api.example.com

# Cookie-based authentication
./scripts/dast-standalone.sh -a cookie -c "session=abc123; csrf=def456" https://secure.example.com
```

### Advanced Scan

```bash
# Deep scan with custom configuration
./scripts/dast-standalone.sh \
    -d 10 \
    -T 8 \
    --max-duration 3600 \
    --defectdojo-url https://defectdojo.example.com \
    --defectdojo-token YOUR_TOKEN \
    --defectdojo-project "Production App" \
    https://production.example.com
```

## 🛡️ Features

### Core Scanning
- **OWASP ZAP Integration**: Latest ZAP engine with comprehensive rule sets
- **Multi-threaded Scanning**: Configurable thread count for performance optimization
- **AJAX Spider Support**: JavaScript-heavy application scanning
- **Configurable Depth**: Control scan scope and intensity
- **Performance Optimization**: Request delays and timeout controls

### Authentication Support
- **Form-based**: Username/password with custom field mapping
- **Token-based**: Bearer token authentication
- **Cookie-based**: Session management
- **OAuth2**: Framework for OAuth2 implementation
- **Multi-factor**: Support for complex authentication flows

### Enterprise Integration
- **DefectDojo Integration**: Automatic finding upload with metadata
- **Security Policy Validation**: Configurable violation thresholds
- **Comprehensive Reporting**: JSON, HTML, and Markdown formats
- **CI/CD Ready**: Designed for pipeline integration
- **Docker-based**: Portable and consistent execution

### Advanced Features
- **Exclusion Management**: URLs, parameters, headers, and cookies
- **Policy Enforcement**: Fail on critical/medium vulnerabilities
- **Performance Monitoring**: Scan duration and resource usage
- **Enhanced Logging**: Detailed debug and operational logs
- **Error Handling**: Comprehensive validation and recovery

## 📦 Installation

### Prerequisites

```bash
# Required tools
docker --version                    # Docker Engine >= 20.10
python3 --version                   # Python >= 3.8
curl --version                      # HTTP client

# Optional tools
jq --version                       # JSON processing
bc --version                       # Floating point arithmetic
```

### Setup

```bash
# Clone the repository (if not already cloned)
git clone https://github.com/your-org/poc-gitlab-cicd-sast.git
cd poc-gitlab-cicd-sast

# Make scripts executable
chmod +x scripts/dast-standalone.sh
chmod +x scripts/dast-defectdojo-enhanced.py
chmod +x scripts/dast-test-framework.sh

# Create configuration template
./scripts/dast-standalone.sh --create-config

# Verify installation
./scripts/dast-test-framework.sh unit
```

## ⚙️ Configuration

### Configuration File Structure

```json
{
  "scan_configuration": {
    "scan_depth": 5,
    "threads": 5,
    "max_duration": 1800,
    "delay_ms": 0,
    "ajax_spider": true,
    "ajax_spider_max_duration": 1800,
    "browser_id": "chrome-headless"
  },
  "authentication": {
    "method": "none",
    "username": "",
    "password": "",
    "token": "",
    "cookies": ""
  },
  "exclusions": {
    "exclude_urls": ".*\\.css$,.*\\.js$",
    "exclude_params": "session.*,csrf.*",
    "exclude_headers": "X-Debug",
    "exclude_cookies": "session.*"
  },
  "defectdojo": {
    "url": "",
    "token": "",
    "project_name": "",
    "upload_findings": true
  },
  "security_policy": {
    "fail_on_high_critical": true,
    "fail_on_medium": false,
    "max_high_vulnerabilities": 0,
    "max_medium_vulnerabilities": 10
  },
  "output": {
    "report_dir": "./dast-reports",
    "report_name": "dast-report",
    "generate_html": true,
    "generate_markdown": true,
    "verbose": true
  }
}
```

### Environment Variables

```bash
# Core configuration
export DAST_CONFIG="path/to/dast-config.json"
export DAST_WORK_DIR="/tmp/dast-work"
export DAST_REPORT_DIR="./dast-reports"

# OWASP ZAP configuration
export ZAP_API_KEY="your-zap-api-key"
export ZAP_DOCKER_IMAGE="owasp/zap2docker-stable"
export ZAP_SCAN_DEPTH="5"
export ZAP_THREADS="5"
export ZAP_MAX_DURATION="1800"

# Authentication
export DAST_USERNAME="your-username"
export DAST_PASSWORD="your-password"
export DAST_TOKEN="your-bearer-token"

# DefectDojo integration
export DEFECTDOJO_URL="https://defectdojo.example.com"
export DEFECTDOJO_TOKEN="your-defectdojo-token"
export DEFECTDOJO_PROJECT_NAME="Your App"

# Security policy
export FAIL_ON_HIGH_CRITICAL="true"
export FAIL_ON_MEDIUM="false"
export MAX_HIGH_VULNERABILITIES="0"
export MAX_MEDIUM_VULNERABILITIES="10"
```

## 🔐 Authentication

### Form-Based Authentication

```bash
# Basic form authentication
./scripts/dast-standalone.sh \
    -a form \
    -u admin \
    -p password \
    --auth-url https://example.com/login \
    https://app.example.com

# Custom form fields
./scripts/dast-standalone.sh \
    -a form \
    -u admin \
    -p password \
    --auth-url https://example.com/auth \
    --login-field email \
    --password-field pass \
    --verify-url https://example.com/dashboard \
    https://app.example.com
```

### Token-Based Authentication

```bash
# Bearer token authentication
./scripts/dast-standalone.sh \
    -a token \
    -t "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
    https://api.example.com

# API key authentication
./scripts/dast-standalone.sh \
    -a token \
    --token-header "X-API-Key: your-api-key" \
    https://api.example.com
```

### Cookie-Based Authentication

```bash
# Session cookie authentication
./scripts/dast-standalone.sh \
    -a cookie \
    -c "session=abc123; csrf=def456; auth=token789" \
    https://secure.example.com

# Multiple cookies with specific values
./scripts/dast-standalone.sh \
    -a cookie \
    -c "JSESSIONID=12345; AWSELB=67890; SESSION=abcdef" \
    https://session.example.com
```

### OAuth2 Authentication (Framework)

```bash
# OAuth2 authentication (requires custom implementation)
./scripts/dast-standalone.sh \
    -a oauth \
    -u client_id \
    -p client_secret \
    --auth-url https://example.com/oauth/token \
    --verify-url https://example.com/api/user \
    https://app.example.com
```

## 🚀 Usage

### Command Line Options

```bash
Usage: ./scripts/dast-standalone.sh [OPTIONS] TARGET_URL

Required Arguments:
    TARGET_URL              Target application URL to scan

Authentication Options:
    -a, --auth-method METHOD    Authentication method
    -u, --username USERNAME      Username for form authentication
    -p, --password PASSWORD      Password for form authentication
    -t, --token TOKEN            Bearer token for token authentication
    -c, --cookies COOKIES         Cookies for cookie authentication
    --auth-url URL              Authentication URL
    --login-field FIELD         Login field name
    --password-field FIELD      Password field name
    --verify-url URL            URL to verify authentication

Scan Configuration:
    -d, --depth LEVEL           Scan depth level
    -T, --threads COUNT         Number of scan threads
    --max-duration SECONDS      Maximum scan duration
    --delay-ms MILLISECONDS     Delay between requests
    --ajax-spider               Enable AJAX spider
    --ajax-duration SECONDS     AJAX spider max duration
    --browser-id ID             Browser ID for AJAX spider

Output Options:
    -o, --output-dir DIR        Output directory for reports
    -r, --report-name NAME      Base name for reports
    --no-html                   Disable HTML report generation
    --no-markdown              Disable Markdown report generation
    -v, --verbose               Enable verbose output
    -q, --quiet                 Minimal output (errors only)

DefectDojo Options:
    --defectdojo-url URL        DefectDojo instance URL
    --defectdojo-token TOKEN    DefectDojo API token
    --defectdojo-project NAME   DefectDojo project name
    --defectdojo-engagement NAME DefectDojo engagement name
    --no-defectdojo            Disable DefectDojo upload

Policy Options:
    --fail-on-high             Fail scan on high risk findings
    --no-fail-on-high         Don't fail on high risk findings
    --fail-on-medium           Fail scan on medium risk findings
    --no-fail-on-medium       Don't fail on medium risk findings
    --max-high COUNT           Maximum allowed high risk findings
    --max-medium COUNT         Maximum allowed medium risk findings

General Options:
    -h, --help                 Show this help message
    --version                  Show version information
    --create-config            Create configuration template
```

### Examples by Use Case

#### Development Testing

```bash
# Quick development scan with immediate feedback
./scripts/dast-standalone.sh \
    -v \
    --max-duration 600 \
    --ajax-spider \
    http://localhost:3000

# Development scan with form authentication
./scripts/dast-standalone.sh \
    -a form \
    -u dev_user \
    -p dev_password \
    -d 3 \
    --max-duration 900 \
    http://dev.example.com
```

#### Staging Validation

```bash
# Comprehensive staging scan
./scripts/dast-standalone.sh \
    -c ./config/staging-config.json \
    -d 8 \
    -T 6 \
    --max-duration 2400 \
    --defectdojo-url https://defectdojo-staging.example.com \
    --defectdojo-token $STAGING_DOJO_TOKEN \
    --defectdojo-project "Staging Application" \
    https://staging.example.com

# Staging scan with policy enforcement
./scripts/dast-standalone.sh \
    -c ./config/staging-config.json \
    --fail-on-medium \
    --max-high 0 \
    --max-medium 5 \
    https://staging.example.com
```

#### Production Security Assessment

```bash
# Production security assessment
./scripts/dast-standalone.sh \
    -c ./config/production-config.json \
    -d 10 \
    -T 8 \
    --max-duration 3600 \
    --delay-ms 100 \
    --ajax-spider \
    --defectdojo-url https://defectdojo.example.com \
    --defectdojo-token $PRODUCTION_DOJO_TOKEN \
    --defectdojo-project "Production App" \
    --defectdojo-engagement "Quarterly Security Assessment" \
    --fail-on-high \
    --max-high 0 \
    https://production.example.com

# High-frequency production monitoring
./scripts/dast-standalone.sh \
    -a token \
    -t $PRODUCTION_API_TOKEN \
    -d 5 \
    --max-duration 1200 \
    --exclude-urls ".*\\.css$,.*\\.js$,.*\\.png$" \
    --no-defectdojo \
    https://api.production.example.com
```

## 🔧 Advanced Configuration

### Exclusion Patterns

```bash
# URL exclusions
./scripts/dast-standalone.sh \
    --exclude-urls ".*\\.css$,.*\\.js$,.*\\.png$,.*\\.jpg$" \
    --exclude-urls ".*admin.*,.*settings.*,.*api/v1/internal.*" \
    https://example.com

# Parameter exclusions
./scripts/dast-standalone.sh \
    --exclude-params "session.*,csrf.*,auth.*,token.*" \
    --exclude-params "password.*,confirm.*,credit_card.*" \
    https://example.com

# Header exclusions
./scripts/dast-standalone.sh \
    --exclude-headers "X-Debug,X-Requested-With,X-Dev-Tools" \
    https://example.com

# Cookie exclusions
./scripts/dast-standalone.sh \
    --exclude-cookies "session.*,csrf.*,auth.*,analytics.*" \
    https://example.com
```

### Performance Tuning

```bash
# High-performance scanning
./scripts/dast-standalone.sh \
    -d 15 \
    -T 10 \
    --delay-ms 50 \
    --ajax-spider \
    --ajax-duration 2400 \
    --max-duration 7200 \
    https://large-application.example.com

# Cautious scanning (minimal impact)
./scripts/dast-standalone.sh \
    -d 3 \
    -T 2 \
    --delay-ms 500 \
    --no-ajax-spider \
    --max-duration 1800 \
    https://critical-production.example.com
```

### Browser Configuration

```bash
# AJAX spider with different browsers
./scripts/dast-standalone.sh \
    --ajax-spider \
    --browser-id firefox-headless \
    --ajax-duration 1800 \
    https://example.com

# AJAX spider with Chrome
./scripts/dast-standalone.sh \
    --ajax-spider \
    --browser-id chrome-headless \
    --ajax-duration 2400 \
    https://example.com
```

## 🔗 DefectDojo Integration

### Basic Integration

```bash
# Enable DefectDojo upload with project auto-creation
./scripts/dast-standalone.sh \
    --defectdojo-url https://defectdojo.example.com \
    --defectdojo-token $DOJO_TOKEN \
    --defectdojo-project "My Application" \
    https://app.example.com
```

### Advanced Integration

```bash
# Full DefectDojo integration with custom engagement
./scripts/dast-standalone.sh \
    --defectdojo-url https://defectdojo.example.com \
    --defectdojo-token $DOJO_TOKEN \
    --defectdojo-project "Production App" \
    --defectdojo-engagement "Security Assessment Q1 2025" \
    -c ./config/production-config.json \
    https://production.example.com

# Using enhanced uploader directly
python3 scripts/dast-defectdojo-enhanced.py \
    https://defectdojo.example.com \
    $DOJO_TOKEN \
    "Production App" \
    dast-reports/dast-report.json
```

### DefectDojo Configuration

```python
# DefectDojo API token creation
# 1. Login to DefectDojo
# 2. Go to User Profile > API Keys
# 3. Generate new token with appropriate permissions

# Required permissions for DAST integration:
# - View Products
# - Add Products
# - View Engagements
# - Add Engagements
# - Add Findings
# - Upload Scan Results
```

### Finding Categories

The DAST scanner automatically categorizes findings based on OWASP categories:

- **WASC-1**: Path Traversal
- **WASC-2**: SQL Injection
- **WASC-3**: Cross-Site Scripting (XSS)
- **WASC-4**: Cross-Site Request Forgery (CSRF)
- **WASC-5**: Server-Side Include
- **WASC-6**: Session Hijacking
- **WASC-7**: Buffer Overflow
- **WASC-8**: Weak Authentication
- **WASC-9**: Transport Layer Security
- **WASC-10**: Insecure Cryptographic Storage
- **WASC-11**: Insufficient Authorization
- **WASC-12**: Denial of Service
- **WASC-13**: Improper Input Validation
- **WASC-14**: Information Leakage
- **WASC-15**: Broken Authentication
- **WASC-16**: Broken Access Control
- **WASC-17**: Server-Side Request Forgery
- **WASC-18**: XML External Entity (XXE)
- **WASC-19**: Insecure Deserialization
- **WASC-20**: Security Misconfiguration

## 🧪 Testing

### Test Framework Usage

```bash
# Run all tests
./scripts/dast-test-framework.sh

# Run specific test categories
./scripts/dast-test-framework.sh unit
./scripts/dast-test-framework.sh integration
./scripts/dast-test-framework.sh authentication
./scripts/dast-test-framework.sh performance

# Run with verbose output
./scripts/dast-test-framework.sh -v

# Run with custom timeout
./scripts/dast-test-framework.sh -t 120
```

### Test Categories

#### Unit Tests
- Script existence and permissions
- Configuration template validation
- Help text functionality
- Python syntax validation
- Docker availability check

#### Integration Tests
- ZAP Docker image pulling
- ZAP container startup
- API connectivity validation
- Configuration file creation
- Component interaction

#### Authentication Tests
- Form authentication configuration
- Token authentication configuration
- Cookie authentication configuration
- Input validation
- Security parameter handling

#### Performance Tests
- Script execution timing
- Configuration parsing performance
- Resource usage validation
- Timeout handling

#### Security Tests
- Sensitive data protection
- Input validation
- File permissions
- Error handling

### Continuous Testing

```bash
# Add to CI/CD pipeline
test_dast_scanner:
  stage: test
  script:
    - ./scripts/dast-test-framework.sh
  artifacts:
    reports:
      junit: scripts/tests/results/*.xml
    paths:
      - scripts/tests/logs/
      - scripts/tests/results/
```

## 📊 Reporting

### Report Formats

#### JSON Report
```bash
# Main JSON report (ZAP format)
./scripts/dast-standalone.sh -r security-scan https://example.com

# JSON report contains:
{
  "site": [
    {
      "@id": "0",
      "name": "https://example.com",
      "alerts": [
        {
          "pluginid": "10058",
          "alert": "X-Content-Type-Options header missing",
          "risk": "Low",
          "desc": "Long description...",
          "instances": [
            {
              "uri": "https://example.com/",
              "method": "GET",
              "evidence": ""
            }
          ]
        }
      ]
    }
  ]
}
```

#### HTML Report
```bash
# Comprehensive HTML report with visual findings
./scripts/dast-standalone.sh \
    -r security-scan \
    --generate-html \
    https://example.com

# Output: security-scan.html
# - Interactive vulnerability display
# - Evidence and screenshots (if available)
# - Risk level classification
# - OWASP categorization
```

#### Markdown Report
```bash
# Developer-friendly markdown summary
./scripts/dast-standalone.sh \
    -r security-scan \
    --generate-markdown \
    https://example.com

# Output: security-scan.md
# - Executive summary
# - Finding breakdown by severity
# - OWASP category distribution
# - Remediation recommendations
```

### Metrics and Analytics

```bash
# Scan metrics report (automatically generated)
./scripts/dast-standalone.sh \
    -r security-metrics \
    https://example.com

# Metrics include:
{
  "scan_metadata": {
    "target_url": "https://example.com",
    "scan_timestamp": "2025-01-01T12:00:00Z",
    "scanner_version": "1.0.0"
  },
  "findings_summary": {
    "high_risk": 2,
    "medium_risk": 5,
    "low_risk": 12,
    "informational": 8,
    "total_findings": 27
  },
  "owasp_categories": {
    "WASC-14": 3,
    "WASC-2": 2,
    "WASC-3": 1
  },
  "performance_metrics": {
    "scan_duration": 1547,
    "pages_scanned": 45,
    "requests_sent": 1250
  }
}
```

## 🔒 Security Policy Validation

### Policy Configuration

```json
{
  "security_policy": {
    "fail_on_high_critical": true,
    "fail_on_medium": false,
    "max_high_vulnerabilities": 0,
    "max_medium_vulnerabilities": 10,
    "max_low_vulnerabilities": 50,
    "policy_rules": {
      "critical_threshold": 0,
      "high_threshold": 0,
      "medium_threshold": 10,
      "low_threshold": 50
    }
  }
}
```

### Policy Violation Examples

```bash
# Strict security policy (no findings allowed)
./scripts/dast-standalone.sh \
    --fail-on-high \
    --fail-on-medium \
    --max-high 0 \
    --max-medium 0 \
    https://production.example.com

# Lenient development policy
./scripts/dast-standalone.sh \
    --no-fail-on-high \
    --no-fail-on-medium \
    --max-high 5 \
    --max-medium 20 \
    https://development.example.com
```

### Policy Report

```json
{
  "policy_validation": {
    "timestamp": "2025-01-01T12:00:00Z",
    "scanner": "dast-standalone",
    "findings": {
      "high_risk": 2,
      "medium_risk": 5,
      "low_risk": 12
    },
    "policy_rules": {
      "fail_on_high_critical": true,
      "fail_on_medium": false,
      "max_high_vulnerabilities": 0,
      "max_medium_vulnerabilities": 10
    },
    "violations": {
      "high_violations": 2,
      "medium_violations": 0,
      "total_violations": 2
    },
    "decision": "failed"
  }
}
```

## 🚨 Troubleshooting

### Common Issues

#### Docker Issues

```bash
# Docker daemon not running
Error: Docker daemon is not running or accessible
Solution: Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Docker permission denied
Error: permission denied while trying to connect to Docker daemon
Solution: Add user to docker group
sudo usermod -aG docker $USER
# Log out and log back in
```

#### ZAP Container Issues

```bash
# ZAP container fails to start
Error: Failed to start ZAP
Solution: Check Docker image and port availability
docker pull owasp/zap2docker-stable
netstat -tulpn | grep 8090

# ZAP API not responding
Error: ZAP API failed to start
Solution: Increase timeout or check container logs
docker logs dast-zap-<container-id>
```

#### Authentication Issues

```bash
# Form authentication fails
Error: Form authentication failed
Solution: Verify credentials and form field names
./scripts/dast-standalone.sh --auth-url https://example.com/login \
    --login-field username --password-field pass \
    -u admin -p password https://example.com

# Token authentication fails
Error: Token authentication failed
Solution: Verify token format and validity
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.example.com/health
```

#### Network Issues

```bash
# Target URL not accessible
Error: Target URL may not be accessible
Solution: Check network connectivity and DNS
curl -I https://target.example.com
ping target.example.com

# SSL certificate issues
Error: SSL certificate problem
Solution: Update CA certificates or use trusted certificates
sudo apt-get update && sudo apt-get install -y ca-certificates
```

### Debug Mode

```bash
# Enable verbose logging
export VERBOSE=true
./scripts/dast-standalone.sh -v https://example.com

# Debug specific components
export DEBUG_ZAP=true
export DEBUG_AUTH=true
export DEBUG_POLICY=true
./scripts/dast-standalone.sh https://example.com

# Preserve workspace for debugging
export PRESERVE_WORKSPACE=true
./scripts/dast-standalone.sh https://example.com
```

### Log Analysis

```bash
# Check scan logs
tail -f dast-workspace/dast-*.log

# Parse ZAP logs
grep "ERROR" dast-workspace/zap.log
grep "WARNING" dast-workspace/zap.log

# Check authentication logs
grep "auth" dast-workspace/dast-*.log
```

### Performance Issues

```bash
# High memory usage
Solution: Limit threads and scan depth
./scripts/dast-standalone.sh -d 3 -T 2 --max-duration 1800 https://example.com

# Slow scan performance
Solution: Optimize exclusions and target scope
./scripts/dast-standalone.sh \
    --exclude-urls ".*\\.css$,.*\\.js$,.*\\.png$" \
    --delay-ms 100 \
    -d 5 \
    https://example.com
```

## 🤝 Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/your-org/poc-gitlab-cicd-sast.git
cd poc-gitlab-cicd-sast

# Create development branch
git checkout -b feature/dast-enhancement

# Install development dependencies
pip install -r requirements-dev.txt

# Run tests
./scripts/dast-test-framework.sh

# Run linting
shellcheck scripts/dast-standalone.sh
flake8 scripts/dast-defectdojo-enhanced.py
```

### Code Standards

- **Bash**: Follow Google Shell Style Guide
- **Python**: Follow PEP 8 with Black formatting
- **Documentation**: Use Markdown with proper formatting
- **Testing**: Maintain >90% test coverage
- **Security**: Validate all inputs and sanitize outputs

### Pull Request Process

1. **Create feature branch** from main
2. **Make changes** with comprehensive tests
3. **Run test suite**: `./scripts/dast-test-framework.sh`
4. **Update documentation** for new features
5. **Submit pull request** with detailed description
6. **Address feedback** from code review
7. **Merge to main** after approval

### Issue Reporting

```bash
# Report bugs with detailed information
./scripts/dast-standalone.sh --version > version.txt
./scripts/dast-standalone.sh --help > help.txt
./scripts/dast-test-framework.sh -v > test-results.txt

# Include in bug report:
# - Version information
# - Configuration used
# - Target URL (if public)
# - Error messages and logs
# - System information
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 📞 Support

- **Documentation**: [DAST Standalone Scanner Docs](./docs/DAST-STANDALONE-README.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/poc-gitlab-cicd-sast/issues)
- **Security**: Report security issues to security@example.com
- **Community**: [Discord/Slack Channel](https://community.example.com)

## 🎯 Roadmap

### Version 1.1 (Q1 2025)
- [ ] GraphQL API scanning support
- [ ] WebSocket vulnerability testing
- [ ] API key rotation support
- [ ] Advanced reporting templates

### Version 1.2 (Q2 2025)
- [ ] Multi-target scanning
- [ ] Scheduled scanning capabilities
- [ ] Cloud provider integrations
- [ ] Mobile application scanning

### Version 2.0 (Q3 2025)
- [ ] REST API for scanner management
- [ ] Distributed scanning support
- [ ] Machine learning-based detection
- [ ] Custom rule engine

---

**Built with ❤️ by the Security Team**

*For security emergencies, contact: security@example.com | +1-555-SECURITY*