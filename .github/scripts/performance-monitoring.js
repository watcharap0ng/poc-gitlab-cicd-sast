#!/usr/bin/env node

/**
 * Performance Monitoring and Analysis Script
 *
 * This script monitors application performance, collects metrics,
 * and generates performance reports with recommendations.
 */

const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      responseTime: [],
      throughput: [],
      errorRate: [],
      cpu: [],
      memory: [],
      disk: [],
      network: []
    };
    this.thresholds = {
      responseTime: {
        good: 200,      // ms
        fair: 500,      // ms
        poor: 1000      // ms
      },
      throughput: {
        good: 1000,     // requests/sec
        fair: 500,      // requests/sec
        poor: 100       // requests/sec
      },
      errorRate: {
        good: 0.1,      // %
        fair: 1,        // %
        poor: 5         // %
      },
      cpu: {
        good: 50,       // %
        fair: 75,       // %
        poor: 90        // %
      },
      memory: {
        good: 70,       // %
        fair: 85,       // %
        poor: 95        // %
      }
    };
    this.recommendations = [];
  }

  async run() {
    console.log('📊 Starting Performance Monitoring...');
    console.log('='.repeat(60));

    try {
      // Load test results if available
      await this.loadTestResults();

      // Analyze performance metrics
      this.analyzePerformance();

      // Generate recommendations
      this.generateRecommendations();

      // Create performance report
      this.createPerformanceReport();

      console.log('✅ Performance monitoring completed');

    } catch (error) {
      console.error('❌ Error during performance monitoring:', error);
      process.exit(1);
    }
  }

  async loadTestResults() {
    console.log('📂 Loading performance test results...');

    // Look for Artillery results
    if (fs.existsSync('artillery-results-load.json')) {
      const artilleryData = JSON.parse(fs.readFileSync('artillery-results-load.json', 'utf8'));
      this.processArtilleryResults(artilleryData, 'load');
    }

    // Look for K6 results
    if (fs.existsSync('k6-results-load.json')) {
      const k6Data = JSON.parse(fs.readFileSync('k6-results-load.json', 'utf8'));
      this.processK6Results(k6Data, 'load');
    }

    // Look for Lighthouse results
    const lighthouseFiles = fs.readdirSync('.lighthouseci/').filter(f => f.endsWith('.json'));
    if (lighthouseFiles.length > 0) {
      const lighthouseData = JSON.parse(fs.readFileSync(path.join('.lighthouseci', lighthouseFiles[0]), 'utf8'));
      this.processLighthouseResults(lighthouseData);
    }

    console.log('✅ Performance results loaded');
  }

  processArtilleryResults(data, testType) {
    console.log(`🔍 Processing Artillery ${testType} test results...`);

    if (data.aggregate) {
      const aggregate = data.aggregate;

      // Response time metrics
      if (aggregate.responseTimes) {
        this.metrics.responseTime.push({
          type: testType,
          mean: aggregate.responseTimes.mean,
          median: aggregate.responseTimes.median,
          p95: aggregate.responseTimes.p95,
          p99: aggregate.responseTimes.p99
        });
      }

      // Throughput metrics
      if (aggregate.rps) {
        this.metrics.throughput.push({
          type: testType,
          mean: aggregate.rps.mean,
          count: aggregate.rps.count
        });
      }

      // Error rate metrics
      if (aggregate.errors) {
        this.metrics.errorRate.push({
          type: testType,
          rate: aggregate.errors,
          count: aggregate.errorsGenerated
        });
      }
    }
  }

  processK6Results(data, testType) {
    console.log(`🔍 Processing K6 ${testType} test results...`);

    // K6 results are typically an array of metrics
    const metrics = data.metrics || {};

    // Response time
    if (metrics.http_req_duration) {
      const rt = metrics.http_req_duration;
      this.metrics.responseTime.push({
        type: `${testType}-k6`,
        mean: rt.values ? rt.values.avg : 0,
        median: rt.values ? rt.values.med : 0,
        p95: rt.values ? rt.values['p(95)'] : 0,
        p99: rt.values ? rt.values['p(99)'] : 0
      });
    }

    // Throughput
    if (metrics.http_reqs) {
      const rps = metrics.http_reqs;
      this.metrics.throughput.push({
        type: `${testType}-k6`,
        mean: rps.rate || 0,
        count: rps.count || 0
      });
    }

    // Error rate
    if (metrics.http_req_failed) {
      const errors = metrics.http_req_failed;
      this.metrics.errorRate.push({
        type: `${testType}-k6`,
        rate: errors.rate ? errors.rate * 100 : 0,
        count: errors.count || 0
      });
    }
  }

  processLighthouseResults(data) {
    console.log('🔍 Processing Lighthouse results...');

    const lhr = data.lhr;
    const categories = lhr.categories;

    if (categories && categories.performance) {
      const performance = categories.performance;
      const score = performance.score * 100;

      // Add Lighthouse metrics to our collection
      this.metrics.lighthouse = {
        performanceScore: score,
        audits: lhr.audits
      };

      // Extract specific metrics
      if (lhr.audits) {
        const audits = lhr.audits;

        if (audits['largest-contentful-paint']) {
          this.metrics.responseTime.push({
            type: 'lighthouse-lcp',
            mean: audits['largest-contentful-paint'].numericValue || 0
          });
        }

        if (audits['first-contentful-paint']) {
          this.metrics.responseTime.push({
            type: 'lighthouse-fcp',
            mean: audits['first-contentful-paint'].numericValue || 0
          });
        }

        if (audits['cumulative-layout-shift']) {
          this.metrics.layoutShift = audits['cumulative-layout-shift'].numericValue || 0;
        }
      }
    }
  }

  analyzePerformance() {
    console.log('📈 Analyzing performance metrics...');

    // Analyze response times
    this.analyzeResponseTimes();

    // Analyze throughput
    this.analyzeThroughput();

    // Analyze error rates
    this.analyzeErrorRates();

    // Analyze Lighthouse performance
    this.analyzeLighthousePerformance();

    console.log('✅ Performance analysis completed');
  }

  analyzeResponseTimes() {
    if (this.metrics.responseTime.length === 0) {
      this.recommendations.push({
        category: 'data',
        priority: 'high',
        issue: 'No response time data available',
        recommendation: 'Implement performance testing to measure response times'
      });
      return;
    }

    const avgResponseTime = this.calculateAverage(this.metrics.responseTime.map(rt => rt.mean));
    const maxResponseTime = Math.max(...this.metrics.responseTime.map(rt => rt.p95 || rt.mean));

    console.log(`📊 Response Time Analysis:`);
    console.log(`   Average: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`   95th percentile: ${maxResponseTime.toFixed(2)}ms`);

    if (avgResponseTime > this.thresholds.responseTime.poor) {
      this.recommendations.push({
        category: 'response-time',
        priority: 'high',
        issue: `Poor average response time: ${avgResponseTime.toFixed(2)}ms`,
        recommendation: 'Optimize database queries, implement caching, and consider CDN usage'
      });
    } else if (avgResponseTime > this.thresholds.responseTime.fair) {
      this.recommendations.push({
        category: 'response-time',
        priority: 'medium',
        issue: `Fair response time: ${avgResponseTime.toFixed(2)}ms`,
        recommendation: 'Review slow endpoints and implement performance optimizations'
      });
    }
  }

  analyzeThroughput() {
    if (this.metrics.throughput.length === 0) {
      return;
    }

    const avgThroughput = this.calculateAverage(this.metrics.throughput.map(t => t.mean));
    const maxThroughput = Math.max(...this.metrics.throughput.map(t => t.mean));

    console.log(`📊 Throughput Analysis:`);
    console.log(`   Average: ${avgThroughput.toFixed(2)} requests/sec`);
    console.log(`   Peak: ${maxThroughput.toFixed(2)} requests/sec`);

    if (avgThroughput < this.thresholds.throughput.poor) {
      this.recommendations.push({
        category: 'throughput',
        priority: 'high',
        issue: `Low throughput: ${avgThroughput.toFixed(2)} requests/sec`,
        recommendation: 'Scale infrastructure, optimize application code, and implement load balancing'
      });
    } else if (avgThroughput < this.thresholds.throughput.fair) {
      this.recommendations.push({
        category: 'throughput',
        priority: 'medium',
        issue: `Fair throughput: ${avgThroughput.toFixed(2)} requests/sec`,
        recommendation: 'Monitor performance during peak usage and plan for capacity scaling'
      });
    }
  }

  analyzeErrorRates() {
    if (this.metrics.errorRate.length === 0) {
      return;
    }

    const avgErrorRate = this.calculateAverage(this.metrics.errorRate.map(e => e.rate));
    const maxErrorRate = Math.max(...this.metrics.errorRate.map(e => e.rate));

    console.log(`📊 Error Rate Analysis:`);
    console.log(`   Average: ${avgErrorRate.toFixed(2)}%`);
    console.log(`   Peak: ${maxErrorRate.toFixed(2)}%`);

    if (avgErrorRate > this.thresholds.errorRate.poor) {
      this.recommendations.push({
        category: 'error-rate',
        priority: 'high',
        issue: `High error rate: ${avgErrorRate.toFixed(2)}%`,
        recommendation: 'Investigate error causes, improve error handling, and implement monitoring alerts'
      });
    } else if (avgErrorRate > this.thresholds.errorRate.fair) {
      this.recommendations.push({
        category: 'error-rate',
        priority: 'medium',
        issue: `Fair error rate: ${avgErrorRate.toFixed(2)}%`,
        recommendation: 'Review error logs and improve application stability'
      });
    }
  }

  analyzeLighthousePerformance() {
    if (!this.metrics.lighthouse) {
      return;
    }

    const performanceScore = this.metrics.lighthouse.performanceScore;
    console.log(`📊 Lighthouse Performance Score: ${performanceScore}/100`);

    if (performanceScore < 50) {
      this.recommendations.push({
        category: 'lighthouse',
        priority: 'high',
        issue: `Poor Lighthouse score: ${performanceScore}/100`,
        recommendation: 'Implement comprehensive web performance optimizations'
      });
    } else if (performanceScore < 80) {
      this.recommendations.push({
        category: 'lighthouse',
        priority: 'medium',
        issue: `Fair Lighthouse score: ${performanceScore}/100`,
        recommendation: 'Optimize web vitals and Core Web Performance metrics'
      });
    }

    // Analyze specific Lighthouse audits
    if (this.metrics.lighthouse.audits) {
      const audits = this.metrics.lighthouse.audits;

      // Check for specific performance issues
      if (audits['unused-css-rules'] && audits['unused-css-rules'].score < 0.9) {
        this.recommendations.push({
          category: 'optimization',
          priority: 'medium',
          issue: 'Unused CSS detected',
          recommendation: 'Remove unused CSS to reduce bundle size'
        });
      }

      if (audits['unused-javascript'] && audits['unused-javascript'].score < 0.9) {
        this.recommendations.push({
          category: 'optimization',
          priority: 'medium',
          issue: 'Unused JavaScript detected',
          recommendation: 'Remove unused JavaScript to reduce bundle size'
        });
      }

      if (audits['render-blocking-resources'] && audits['render-blocking-resources'].score < 0.9) {
        this.recommendations.push({
          category: 'optimization',
          priority: 'high',
          issue: 'Render-blocking resources detected',
          recommendation: 'Eliminate render-blocking resources to improve page load time'
        });
      }
    }
  }

  generateRecommendations() {
    console.log('💡 Generating performance recommendations...');

    // Sort recommendations by priority
    this.recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Add general recommendations
    this.recommendations.push({
      category: 'monitoring',
      priority: 'medium',
      issue: 'Performance monitoring',
      recommendation: 'Set up continuous performance monitoring and alerting'
    });

    this.recommendations.push({
      category: 'testing',
      priority: 'medium',
      issue: 'Performance testing',
      recommendation: 'Implement regular performance testing in CI/CD pipeline'
    });

    console.log(`✅ Generated ${this.recommendations.length} recommendations`);
  }

  createPerformanceReport() {
    console.log('📋 Creating performance report...');

    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      metrics: this.metrics,
      thresholds: this.thresholds,
      recommendations: this.recommendations,
      score: this.calculateOverallScore()
    };

    // Write JSON report
    fs.writeFileSync('performance-monitoring-report.json', JSON.stringify(report, null, 2));

    // Write markdown report
    const markdownReport = this.generateMarkdownReport(report);
    fs.writeFileSync('performance-report.md', markdownReport);

    // Write HTML report
    const htmlReport = this.generateHtmlReport(report);
    fs.writeFileSync('performance-report.html', htmlReport);

    console.log('✅ Performance reports generated:');
    console.log('   performance-monitoring-report.json');
    console.log('   performance-report.md');
    console.log('   performance-report.html');
  }

  generateSummary() {
    const summary = {
      responseTime: this.calculateAverage(this.metrics.responseTime.map(rt => rt.mean)) || 0,
      throughput: this.calculateAverage(this.metrics.throughput.map(t => t.mean)) || 0,
      errorRate: this.calculateAverage(this.metrics.errorRate.map(e => e.rate)) || 0,
      lighthouseScore: this.metrics.lighthouse ? this.metrics.lighthouse.performanceScore : 0,
      totalRecommendations: this.recommendations.length,
      highPriorityRecommendations: this.recommendations.filter(r => r.priority === 'high').length
    };

    return summary;
  }

  calculateOverallScore() {
    let totalScore = 0;
    let metricsCount = 0;

    // Response time score
    if (this.metrics.responseTime.length > 0) {
      const avgRT = this.calculateAverage(this.metrics.responseTime.map(rt => rt.mean));
      let rtScore = 100;
      if (avgRT > this.thresholds.responseTime.poor) rtScore = 25;
      else if (avgRT > this.thresholds.responseTime.fair) rtScore = 60;
      else if (avgRT > this.thresholds.responseTime.good) rtScore = 85;
      totalScore += rtScore;
      metricsCount++;
    }

    // Throughput score
    if (this.metrics.throughput.length > 0) {
      const avgTP = this.calculateAverage(this.metrics.throughput.map(t => t.mean));
      let tpScore = 100;
      if (avgTP < this.thresholds.throughput.poor) tpScore = 25;
      else if (avgTP < this.thresholds.throughput.fair) tpScore = 60;
      else if (avgTP < this.thresholds.throughput.good) tpScore = 85;
      totalScore += tpScore;
      metricsCount++;
    }

    // Error rate score
    if (this.metrics.errorRate.length > 0) {
      const avgER = this.calculateAverage(this.metrics.errorRate.map(e => e.rate));
      let erScore = 100;
      if (avgER > this.thresholds.errorRate.poor) erScore = 25;
      else if (avgER > this.thresholds.errorRate.fair) erScore = 60;
      else if (avgER > this.thresholds.errorRate.good) erScore = 85;
      totalScore += erScore;
      metricsCount++;
    }

    // Lighthouse score
    if (this.metrics.lighthouse) {
      totalScore += this.metrics.lighthouse.performanceScore;
      metricsCount++;
    }

    return metricsCount > 0 ? Math.round(totalScore / metricsCount) : 0;
  }

  generateMarkdownReport(report) {
    const score = report.score;
    const scoreEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

    return `
# Performance Monitoring Report

${scoreEmoji} **Overall Performance Score: ${score}/100**

## Executive Summary
- **Report Date**: ${new Date().toLocaleDateString()}
- **Response Time**: ${report.summary.responseTime.toFixed(2)}ms
- **Throughput**: ${report.summary.throughput.toFixed(2)} requests/sec
- **Error Rate**: ${report.summary.errorRate.toFixed(2)}%
- **Lighthouse Score**: ${report.summary.lighthouseScore}/100

## Performance Metrics

### Response Time Analysis
${this.metrics.responseTime.length > 0 ? `
| Test Type | Mean (ms) | Median (ms) | 95th %ile (ms) |
|-----------|-----------|-------------|-----------------|
${this.metrics.responseTime.map(rt =>
  `| ${rt.type} | ${rt.mean.toFixed(2)} | ${rt.median.toFixed(2)} | ${(rt.p95 || rt.mean).toFixed(2)} |`
).join('\n')}
` : 'No response time data available'}

### Throughput Analysis
${this.metrics.throughput.length > 0 ? `
| Test Type | Requests/sec | Total Requests |
|-----------|--------------|----------------|
${this.metrics.throughput.map(t =>
  `| ${t.type} | ${t.mean.toFixed(2)} | ${t.count || 'N/A'} |`
).join('\n')}
` : 'No throughput data available'}

### Error Rate Analysis
${this.metrics.errorRate.length > 0 ? `
| Test Type | Error Rate (%) | Total Errors |
|-----------|----------------|--------------|
${this.metrics.errorRate.map(e =>
  `| ${e.type} | ${e.rate.toFixed(2)} | ${e.count || 'N/A'} |`
).join('\n')}
` : 'No error rate data available'}

## Recommendations

### High Priority 🔴
${report.recommendations.filter(r => r.priority === 'high').map(r =>
  `- **${r.issue}**: ${r.recommendation}`
).join('\n') || 'No high priority issues'}

### Medium Priority 🟡
${report.recommendations.filter(r => r.priority === 'medium').map(r =>
  `- **${r.issue}**: ${r.recommendation}`
).join('\n') || 'No medium priority issues'}

### Low Priority 🟢
${report.recommendations.filter(r => r.priority === 'low').map(r =>
  `- **${r.issue}**: ${r.recommendation}`
).join('\n') || 'No low priority issues'}

## Performance Thresholds

| Metric | Good | Fair | Poor |
|--------|------|------|------|
| Response Time | <${report.thresholds.responseTime.good}ms | <${report.thresholds.responseTime.fair}ms | ≥${report.thresholds.responseTime.poor}ms |
| Throughput | >${report.thresholds.throughput.good} req/s | >${report.thresholds.throughput.fair} req/s | ≤${report.thresholds.throughput.poor} req/s |
| Error Rate | <${report.thresholds.errorRate.good}% | <${report.thresholds.errorRate.fair}% | ≥${report.thresholds.errorRate.poor}% |

---
*Generated by Performance Monitoring Script*
`;
  }

  generateHtmlReport(report) {
    const score = report.score;
    const scoreColor = score >= 80 ? '#28a745' : score >= 60 ? '#ffc107' : '#dc3545';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Monitoring Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .score-circle { width: 120px; height: 120px; border-radius: 50%; background-color: ${scoreColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; margin: 0 auto 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { color: #6c757d; margin-top: 5px; }
        .recommendations { margin-top: 30px; }
        .recommendation { background-color: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 5px; border-left: 4px solid #007bff; }
        .high-priority { border-left-color: #dc3545; }
        .medium-priority { border-left-color: #ffc107; }
        .low-priority { border-left-color: #28a745; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background-color: #f8f9fa; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Performance Monitoring Report</h1>
            <div class="score-circle">${score}/100</div>
            <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${report.summary.responseTime.toFixed(2)}ms</div>
                <div class="metric-label">Average Response Time</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.throughput.toFixed(2)}</div>
                <div class="metric-label">Requests/Second</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.errorRate.toFixed(2)}%</div>
                <div class="metric-label">Error Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.lighthouseScore}/100</div>
                <div class="metric-label">Lighthouse Score</div>
            </div>
        </div>

        <div class="recommendations">
            <h2>Performance Recommendations</h2>
            ${report.recommendations.map(r => `
                <div class="recommendation ${r.priority}-priority">
                    <strong>${r.issue}</strong>
                    <p>${r.recommendation}</p>
                </div>
            `).join('')}
        </div>

        <div class="thresholds">
            <h2>Performance Thresholds</h2>
            <table>
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Good</th>
                        <th>Fair</th>
                        <th>Poor</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Response Time</td>
                        <td>&lt;${report.thresholds.responseTime.good}ms</td>
                        <td>&lt;${report.thresholds.responseTime.fair}ms</td>
                        <td>≥${report.thresholds.responseTime.poor}ms</td>
                    </tr>
                    <tr>
                        <td>Throughput</td>
                        <td>&gt;${report.thresholds.throughput.good} req/s</td>
                        <td>&gt;${report.thresholds.throughput.fair} req/s</td>
                        <td>≤${report.thresholds.throughput.poor} req/s</td>
                    </tr>
                    <tr>
                        <td>Error Rate</td>
                        <td>&lt;${report.thresholds.errorRate.good}%</td>
                        <td>&lt;${report.thresholds.errorRate.fair}%</td>
                        <td>≥${report.thresholds.errorRate.poor}%</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
`;
  }

  calculateAverage(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }
}

// Run the performance monitor
if (require.main === module) {
  const monitor = new PerformanceMonitor();
  monitor.run();
}

module.exports = PerformanceMonitor;