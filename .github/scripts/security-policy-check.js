#!/usr/bin/env node

/**
 * Enhanced Security Policy Enforcement Script for GitHub Actions
 *
 * This script evaluates security scan results against defined policies
 * and determines if deployments should be allowed or blocked.
 * Enhanced with GitHub Actions specific features and outputs.
 */

const fs = require('fs');
const path = require('path');

// Security policy configuration
const SECURITY_POLICIES = {
  // Maximum allowed vulnerabilities by severity
  maxVulnerabilities: {
    critical: 0,
    high: 5,
    medium: 20,
    low: 50
  },

  // Required security tools to pass
  requiredScans: [
    'gitleaks',
    'semgrep',
    'trivy',
    'npm-audit'
  ],

  // Severity thresholds for blocking
  blockingThresholds: {
    secrets: 0, // Any secrets found = block
    criticalVulns: 0, // Any critical vulns = block
    highVulnsInProd: 0, // No high vulns in production
    codeQualityFailures: 0 // Code quality failures = block
  },

  // Scan result file patterns
  scanFiles: {
    gitleaks: 'gitleaks.sarif',
    semgrep: 'semgrep.sarif',
    njsscan: 'njsscan.sarif',
    trivy: 'trivy-results.sarif',
    npmAudit: 'npm-audit.json',
    snyk: 'snyk.sarif',
    dependencyReview: 'dependency-review.json'
  }
};

class SecurityPolicyChecker {
  constructor() {
    this.results = {
      passed: true,
      blocked: false,
      warnings: [],
      errors: [],
      summary: {},
      details: {}
    };
  }

  async run() {
    console.log('🔒 Starting Security Policy Enforcement...');
    console.log('='.repeat(60));

    try {
      // Load and analyze all scan results
      await this.loadScanResults();

      // Evaluate against policies
      await this.evaluatePolicies();

      // Generate report
      this.generateReport();

      // Exit with appropriate code
      process.exit(this.results.passed ? 0 : 1);

    } catch (error) {
      console.error('❌ Error during security policy check:', error);
      process.exit(1);
    }
  }

  async loadScanResults() {
    console.log('📊 Loading security scan results...');

    for (const [scanName, filename] of Object.entries(SECURITY_POLICIES.scanFiles)) {
      if (fs.existsSync(filename)) {
        try {
          const content = fs.readFileSync(filename, 'utf8');
          this.results.details[scanName] = this.parseScanResult(scanName, content);
          console.log(`✅ Loaded ${scanName} results`);
        } catch (error) {
          console.warn(`⚠️  Failed to parse ${scanName} results: ${error.message}`);
          this.results.warnings.push(`Failed to parse ${scanName} results`);
        }
      } else {
        console.log(`⚠️  ${scanName} results not found: ${filename}`);
        if (SECURITY_POLICIES.requiredScans.includes(scanName)) {
          this.results.errors.push(`Required scan ${scanName} results not found`);
        }
      }
    }
  }

  parseScanResult(scanName, content) {
    try {
      const data = JSON.parse(content);

      switch (scanName) {
        case 'gitleaks':
          return this.parseGitleaks(data);
        case 'semgrep':
        case 'njsscan':
        case 'trivy':
        case 'snyk':
          return this.parseSarif(data);
        case 'npmAudit':
          return this.parseNpmAudit(data);
        case 'dependencyReview':
          return this.parseDependencyReview(data);
        default:
          return { type: scanName, raw: data };
      }
    } catch (error) {
      throw new Error(`Failed to parse ${scanName}: ${error.message}`);
    }
  }

  parseGitleaks(data) {
    const findings = data.results || [];
    return {
      type: 'secrets',
      totalFindings: findings.length,
      findings: findings.map(f => ({
        rule: f.rule,
        severity: f.rule?.severity || 'high',
        file: f.file,
        line: f.startLine,
        secret: f.secret.substring(0, 20) + '...',
        description: f.rule?.description || 'Secret detected'
      })),
      summary: {
        critical: findings.filter(f => f.rule?.severity === 'critical').length,
        high: findings.filter(f => f.rule?.severity === 'high').length,
        medium: findings.filter(f => f.rule?.severity === 'medium').length,
        low: findings.filter(f => f.rule?.severity === 'low').length
      }
    };
  }

  parseSarif(data) {
    const results = data.runs?.[0]?.results || [];
    return {
      type: 'sast',
      totalFindings: results.length,
      findings: results.map(r => ({
        rule: r.ruleId,
        severity: r.level || 'warning',
        file: r.locations?.[0]?.physicalLocation?.artifactLocation?.uri,
        line: r.locations?.[0]?.physicalLocation?.region?.startLine,
        message: r.message?.text,
        description: r.rule?.fullDescription?.text || r.rule?.shortDescription?.text
      })),
      summary: {
        error: results.filter(r => r.level === 'error').length,
        warning: results.filter(r => r.level === 'warning').length,
        note: results.filter(r => r.level === 'note').length,
        info: results.filter(r => r.level === 'info').length
      }
    };
  }

  parseNpmAudit(data) {
    const vulnerabilities = data.vulnerabilities || {};
    const vulnList = Object.values(vulnerabilities);

    return {
      type: 'dependencies',
      totalFindings: vulnList.length,
      findings: vulnList.map(v => ({
        package: v.name,
        severity: v.severity,
        title: v.title,
        url: v.url,
        fixAvailable: !!v.fixAvailable
      })),
      summary: {
        critical: vulnList.filter(v => v.severity === 'critical').length,
        high: vulnList.filter(v => v.severity === 'high').length,
        moderate: vulnList.filter(v => v.severity === 'moderate').length,
        low: vulnList.filter(v => v.severity === 'low').length
      }
    };
  }

  parseDependencyReview(data) {
    const findings = data.scans?.[0]?.results || [];
    return {
      type: 'dependencies',
      totalFindings: findings.length,
      findings: findings.map(f => ({
        package: f.properties?.package_name,
        severity: f.properties?.severity,
        license: f.properties?.license,
        advisories: f.properties?.advisories || []
      })),
      summary: {
        critical: findings.filter(f => f.properties?.severity === 'critical').length,
        high: findings.filter(f => f.properties?.severity === 'high').length,
        medium: findings.filter(f => f.properties?.severity === 'medium').length,
        low: findings.filter(f => f.properties?.severity === 'low').length
      }
    };
  }

  async evaluatePolicies() {
    console.log('⚖️  Evaluating security policies...');

    // Check required scans
    this.evaluateRequiredScans();

    // Check for secrets
    this.evaluateSecrets();

    // Check vulnerability thresholds
    this.evaluateVulnerabilityThresholds();

    // Check code quality
    this.evaluateCodeQuality();

    // Check dependency security
    this.evaluateDependencySecurity();

    // Generate final decision
    this.generateFinalDecision();
  }

  evaluateRequiredScans() {
    const missingScans = SECURITY_POLICIES.requiredScans.filter(
      scan => !this.results.details[scan]
    );

    if (missingScans.length > 0) {
      this.results.errors.push(`Missing required security scans: ${missingScans.join(', ')}`);
      this.results.passed = false;
    }
  }

  evaluateSecrets() {
    const secretsScan = this.results.details.gitleaks;
    if (secretsScan && secretsScan.totalFindings > 0) {
      const secretCount = secretsScan.totalFindings;
      const threshold = SECURITY_POLICIES.blockingThresholds.secrets;

      if (secretCount > threshold) {
        this.results.errors.push(`Found ${secretCount} secrets (threshold: ${threshold})`);
        this.results.passed = false;
        this.results.blocked = true;
      }

      // Log secrets details
      console.log(`🔑 Secrets Found: ${secretCount}`);
      secretsScan.findings.slice(0, 5).forEach(f => {
        console.log(`   - ${f.file}:${f.line} - ${f.description}`);
      });
    }
  }

  evaluateVulnerabilityThresholds() {
    let totalCritical = 0;
    let totalHigh = 0;
    let totalMedium = 0;
    let totalLow = 0;

    // Aggregate vulnerabilities from all scans
    Object.values(this.results.details).forEach(detail => {
      if (detail.summary) {
        totalCritical += detail.summary.critical || 0;
        totalHigh += detail.summary.high || 0;
        totalMedium += detail.summary.medium || 0;
        totalLow += detail.summary.low || 0;
      }
    });

    this.results.summary.vulnerabilities = {
      critical: totalCritical,
      high: totalHigh,
      medium: totalMedium,
      low: totalLow
    };

    console.log(`🛡️  Vulnerability Summary:`);
    console.log(`   Critical: ${totalCritical}`);
    console.log(`   High: ${totalHigh}`);
    console.log(`   Medium: ${totalMedium}`);
    console.log(`   Low: ${totalLow}`);

    // Check thresholds
    const policies = SECURITY_POLICIES.maxVulnerabilities;

    if (totalCritical > policies.critical) {
      this.results.errors.push(`Critical vulnerabilities exceed threshold: ${totalCritical} > ${policies.critical}`);
      this.results.passed = false;
      this.results.blocked = true;
    }

    if (totalHigh > policies.high) {
      this.results.warnings.push(`High vulnerabilities exceed threshold: ${totalHigh} > ${policies.high}`);
      // Warning only, doesn't block by default
    }

    if (totalMedium > policies.medium) {
      this.results.warnings.push(`Medium vulnerabilities exceed threshold: ${totalMedium} > ${policies.medium}`);
    }
  }

  evaluateCodeQuality() {
    const sastScans = ['semgrep', 'njsscan', 'trivy'];
    let totalErrors = 0;
    let totalWarnings = 0;

    sastScans.forEach(scanName => {
      const scan = this.results.details[scanName];
      if (scan && scan.summary) {
        totalErrors += scan.summary.error || 0;
        totalWarnings += scan.summary.warning || 0;
      }
    });

    this.results.summary.codeQuality = {
      errors: totalErrors,
      warnings: totalWarnings
    };

    console.log(`🔍 Code Quality Summary:`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Warnings: ${totalWarnings}`);

    const errorThreshold = SECURITY_POLICIES.blockingThresholds.codeQualityFailures;
    if (totalErrors > errorThreshold) {
      this.results.errors.push(`Code quality errors exceed threshold: ${totalErrors} > ${errorThreshold}`);
      this.results.passed = false;
    }
  }

  evaluateDependencySecurity() {
    const depScans = ['npmAudit', 'snyk', 'dependencyReview'];
    let totalDeps = 0;
    let vulnerableDeps = 0;

    depScans.forEach(scanName => {
      const scan = this.results.details[scanName];
      if (scan) {
        totalDeps += scan.totalFindings || 0;
        if (scan.summary) {
          vulnerableDeps += (scan.summary.critical || 0) + (scan.summary.high || 0);
        }
      }
    });

    this.results.summary.dependencies = {
      total: totalDeps,
      vulnerable: vulnerableDeps
    };

    console.log(`📦 Dependency Security Summary:`);
    console.log(`   Total Dependencies: ${totalDeps}`);
    console.log(`   Vulnerable Dependencies: ${vulnerableDeps}`);

    if (vulnerableDeps > 10) {
      this.results.warnings.push(`High number of vulnerable dependencies: ${vulnerableDeps}`);
    }
  }

  generateFinalDecision() {
    console.log('='.repeat(60));
    console.log('🎯 SECURITY POLICY DECISION');
    console.log('='.repeat(60));

    if (this.results.blocked) {
      console.log('🚫 DEPLOYMENT BLOCKED');
      console.log('Reason: Critical security issues found');
      console.log('');
      console.log('Errors:');
      this.results.errors.forEach(error => console.log(`   ❌ ${error}`));
    } else if (this.results.passed) {
      console.log('✅ DEPLOYMENT APPROVED');
      console.log('Security gates passed');

      if (this.results.warnings.length > 0) {
        console.log('');
        console.log('Warnings:');
        this.results.warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
      }
    } else {
      console.log('❌ DEPLOYMENT FAILED');
      console.log('Security checks failed');
      console.log('');
      console.log('Errors:');
      this.results.errors.forEach(error => console.log(`   ❌ ${error}`));
    }

    console.log('');
    console.log('Summary:');
    Object.entries(this.results.summary).forEach(([key, value]) => {
      console.log(`   ${key}: ${JSON.stringify(value)}`);
    });
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      repository: process.env.GITHUB_REPOSITORY || 'unknown',
      commit: process.env.GITHUB_SHA || 'unknown',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      decision: this.results.blocked ? 'blocked' : (this.results.passed ? 'approved' : 'failed'),
      summary: this.results.summary,
      errors: this.results.errors,
      warnings: this.results.warnings,
      details: this.results.details
    };

    // Write detailed report
    fs.writeFileSync('security-policy-report.json', JSON.stringify(report, null, 2));

    // Write summary for GitHub Actions
    const summaryMd = this.generateMarkdownSummary(report);
    fs.writeFileSync('security-summary.md', summaryMd);

    console.log('');
    console.log('📋 Reports generated:');
    console.log('   security-policy-report.json');
    console.log('   security-summary.md');
  }

  generateMarkdownSummary(report) {
    const statusEmoji = report.decision === 'approved' ? '✅' :
                       report.decision === 'blocked' ? '🚫' : '❌';

    return `
# Security Policy Report

${statusEmoji} **Decision**: ${report.decision.toUpperCase()}

## Executive Summary
- **Repository**: ${report.repository}
- **Commit**: ${report.commit}
- **Branch**: ${report.branch}
- **Timestamp**: ${report.timestamp}

## Security Findings

### Vulnerabilities
- **Critical**: ${report.summary.vulnerabilities?.critical || 0}
- **High**: ${report.summary.vulnerabilities?.high || 0}
- **Medium**: ${report.summary.vulnerabilities?.medium || 0}
- **Low**: ${report.summary.vulnerabilities?.low || 0}

### Code Quality
- **Errors**: ${report.summary.codeQuality?.errors || 0}
- **Warnings**: ${report.summary.codeQuality?.warnings || 0}

### Dependencies
- **Total Scanned**: ${report.summary.dependencies?.total || 0}
- **Vulnerable**: ${report.summary.dependencies?.vulnerable || 0}

## Security Issues

${report.errors.length > 0 ? `
### Errors ❌
${report.errors.map(error => `- ${error}`).join('\n')}
` : '✅ No blocking security issues found'}

${report.warnings.length > 0 ? `
### Warnings ⚠️
${report.warnings.map(warning => `- ${warning}`).join('\n')}
` : ''}

## Recommendations

${report.decision === 'blocked' ? `
🚫 **Deployment Blocked**

Immediate action required:
1. Fix all critical security issues
2. Remove any detected secrets
3. Address code quality errors
4. Re-run security scans
` : report.decision === 'approved' ? `
✅ **Deployment Approved**

Recommended actions:
${report.warnings.length > 0 ? '1. Address warnings in future iterations' : ''}
2. Continue with deployment process
3. Monitor security posture in production
` : `
❌ **Deployment Failed**

Required actions:
1. Fix all security errors
2. Re-run security validation
3. Ensure all required scans complete successfully
`}

---
*Generated by Security Policy Enforcement Script*
`;
  }
}

// Run the security policy checker
if (require.main === module) {
  const checker = new SecurityPolicyChecker();
  checker.run();
}

module.exports = SecurityPolicyChecker;