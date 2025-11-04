#!/usr/bin/env node

/**
 * Application Performance Monitoring (APM) Integration Script
 * Integrates with monitoring tools and collects performance metrics
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class APMIntegration {
    constructor(config = {}) {
        this.config = {
            datadogApiKey: config.datadogApiKey || process.env.DATADOG_API_KEY,
            datadogAppKey: config.datadogAppKey || process.env.DATADOG_APP_KEY,
            newRelicApiKey: config.newRelicApiKey || process.env.NEW_RELIC_API_KEY,
            prometheusGateway: config.prometheusGateway || process.env.PROMETHEUS_GATEWAY_URL,
            grafanaUrl: config.grafanaUrl || process.env.GRAFANA_URL,
            grafanaApiKey: config.grafanaApiKey || process.env.GRAFANA_API_KEY,
            ...config
        };

        // GitHub Actions metadata
        this.metadata = {
            repository: process.env.GITHUB_REPOSITORY || 'unknown',
            commit: process.env.GITHUB_SHA || 'unknown',
            branch: process.env.GITHUB_REF_NAME || 'unknown',
            workflow: process.env.GITHUB_WORKFLOW || 'unknown',
            runId: process.env.GITHUB_RUN_ID || 'unknown',
            actor: process.env.GITHUB_ACTOR || 'unknown',
            timestamp: new Date().toISOString()
        };

        console.log('🔍 APM Integration Service');
        console.log(`   Repository: ${this.metadata.repository}`);
        console.log(`   Commit: ${this.metadata.commit.substring(0, 8)}`);
    }

    /**
     * Send metrics to Datadog
     */
    async sendDatadogMetrics(metrics) {
        if (!this.config.datadogApiKey) {
            console.log('⚠️  Datadog API key not configured, skipping');
            return { success: false, reason: 'missing_api_key' };
        }

        try {
            const series = metrics.map(metric => ({
                metric: metric.name,
                points: [[Math.floor(Date.now() / 1000), metric.value]],
                tags: [
                    `repository:${this.metadata.repository}`,
                    `branch:${this.metadata.branch}`,
                    `commit:${this.metadata.commit}`,
                    `workflow:${this.metadata.workflow}`,
                    `run_id:${this.metadata.runId}`,
                    ...(metric.tags || [])
                ],
                type: metric.type || 'gauge',
                host: metric.host || 'github-actions'
            }));

            const payload = { series };

            const response = await this.makeRequest('POST', 'https://api.datadoghq.com/api/v1/series', payload, {
                'DD-API-KEY': this.config.datadogApiKey,
                'DD-APPLICATION-KEY': this.config.datadogAppKey
            });

            if (response.success) {
                console.log('✅ Datadog metrics sent successfully');
                return { success: true, metrics: series.length };
            } else {
                console.log(`❌ Datadog metrics failed: ${response.error}`);
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error(`❌ Datadog error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send metrics to New Relic
     */
    async sendNewRelicMetrics(metrics) {
        if (!this.config.newRelicApiKey) {
            console.log('⚠️  New Relic API key not configured, skipping');
            return { success: false, reason: 'missing_api_key' };
        }

        try {
            const payload = {
                metrics: metrics.map(metric => ({
                    name: `github.actions.${metric.name}`,
                    type: metric.type || 'gauge',
                    value: metric.value,
                    timestamp: Date.now() * 1000000, // New Relic expects nanoseconds
                    attributes: {
                        'repository.name': this.metadata.repository,
                        'repository.branch': this.metadata.branch,
                        'commit.sha': this.metadata.commit,
                        'workflow.name': this.metadata.workflow,
                        'run.id': this.metadata.runId,
                        'actor.name': this.metadata.actor,
                        ...(metric.attributes || {})
                    }
                }))
            };

            const response = await this.makeRequest('POST', 'https://metric-api.newrelic.com/metric/v1', payload, {
                'Api-Key': this.config.newRelicApiKey,
                'Content-Type': 'application/json'
            });

            if (response.success) {
                console.log('✅ New Relic metrics sent successfully');
                return { success: true, metrics: metrics.length };
            } else {
                console.log(`❌ New Relic metrics failed: ${response.error}`);
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error(`❌ New Relic error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send metrics to Prometheus Pushgateway
     */
    async sendPrometheusMetrics(metrics) {
        if (!this.config.prometheusGateway) {
            console.log('⚠️  Prometheus gateway not configured, skipping');
            return { success: false, reason: 'missing_gateway_url' };
        }

        try {
            const prometheusMetrics = metrics.map(metric => {
                let promMetric = `# HELP github_actions_${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')} ${metric.description || metric.name}\n`;
                promMetric += `# TYPE github_actions_${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')} ${metric.type || 'gauge'}\n`;

                const labels = [
                    `repository="${this.metadata.repository}"`,
                    `branch="${this.metadata.branch}"`,
                    `commit="${this.metadata.commit}"`,
                    `workflow="${this.metadata.workflow}"`,
                    `run_id="${this.metadata.runId}"`,
                    ...(metric.tags || []).map(tag => {
                        const [key, value] = tag.split(':');
                        return `${key.replace(/[^a-zA-Z0-9_]/g, '_')}="${value}"`;
                    })
                ].join(',');

                promMetric += `github_actions_${metric.name.replace(/[^a-zA-Z0-9_]/g, '_')}{${labels}} ${metric.value}\n`;
                return promMetric;
            }).join('\n');

            const url = new URL(`${this.config.prometheusGateway}/metrics/job/github-actions/instance/${this.metadata.repository.replace(/\//g, '_')}`);

            const response = await this.makeRequest('POST', url.toString(), prometheusMetrics, {
                'Content-Type': 'text/plain'
            });

            if (response.success) {
                console.log('✅ Prometheus metrics sent successfully');
                return { success: true, metrics: metrics.length };
            } else {
                console.log(`❌ Prometheus metrics failed: ${response.error}`);
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error(`❌ Prometheus error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create Grafana dashboard
     */
    async createGrafanaDashboard(dashboardConfig) {
        if (!this.config.grafanaUrl || !this.config.grafanaApiKey) {
            console.log('⚠️  Grafana not configured, skipping dashboard creation');
            return { success: false, reason: 'missing_configuration' };
        }

        try {
            const dashboard = {
                dashboard: {
                    ...dashboardConfig,
                    title: `${dashboardConfig.title || 'GitHub Actions Dashboard'} - ${this.metadata.repository}`,
                    tags: [
                        'github-actions',
                        this.metadata.repository.replace(/\//g, '-'),
                        ...(dashboardConfig.tags || [])
                    ],
                    variables: [
                        {
                            name: 'repository',
                            type: 'query',
                            query: this.metadata.repository,
                            current: { selected: false, text: this.metadata.repository, value: this.metadata.repository }
                        },
                        {
                            name: 'branch',
                            type: 'query',
                            query: this.metadata.branch,
                            current: { selected: false, text: this.metadata.branch, value: this.metadata.branch }
                        },
                        ...(dashboardConfig.variables || [])
                    ]
                },
                overwrite: true
            };

            const response = await this.makeRequest('POST', `${this.config.grafanaUrl}/api/dashboards/db`, dashboard, {
                'Authorization': `Bearer ${this.config.grafanaApiKey}`,
                'Content-Type': 'application/json'
            });

            if (response.success) {
                console.log('✅ Grafana dashboard created successfully');
                return {
                    success: true,
                    url: `${this.config.grafanaUrl}${response.data.url}`,
                    uid: response.data.uid
                };
            } else {
                console.log(`❌ Grafana dashboard creation failed: ${response.error}`);
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error(`❌ Grafana error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Collect GitHub Actions performance metrics
     */
    collectGitHubActionsMetrics() {
        const metrics = [];

        try {
            // Collect timing information if available
            if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
                const eventData = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

                if (eventData.check_suite) {
                    metrics.push({
                        name: 'check_suite_duration_ms',
                        value: this.calculateDuration(eventData.check_suite.created_at, eventData.check_suite.completed_at),
                        type: 'gauge',
                        tags: [`check_run:${eventData.check_suite.check_runs?.[0]?.name || 'unknown'}`],
                        description: 'Duration of check suite in milliseconds'
                    });
                }
            }

            // Collect workflow job metrics
            metrics.push({
                name: 'workflow_job_execution',
                value: 1,
                type: 'counter',
                tags: [
                    `workflow:${this.metadata.workflow}`,
                    `status:${process.env.JOB_STATUS || 'running'}`,
                    `runner_os:${process.env.RUNNER_OS || 'unknown'}`
                ],
                description: 'Workflow job execution count'
            });

            // Collect build metrics if available
            if (fs.existsSync('build-stats.json')) {
                const buildStats = JSON.parse(fs.readFileSync('build-stats.json', 'utf8'));

                metrics.push({
                    name: 'build_duration_ms',
                    value: buildStats.duration || 0,
                    type: 'gauge',
                    description: 'Build duration in milliseconds'
                });

                metrics.push({
                    name: 'build_artifact_size_bytes',
                    value: buildStats.artifactSize || 0,
                    type: 'gauge',
                    description: 'Build artifact size in bytes'
                });
            }

            // Collect test metrics
            if (fs.existsSync('test-results.json')) {
                const testResults = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));

                metrics.push({
                    name: 'test_total',
                    value: testResults.total || 0,
                    type: 'gauge',
                    description: 'Total number of tests'
                });

                metrics.push({
                    name: 'test_passed',
                    value: testResults.passed || 0,
                    type: 'gauge',
                    description: 'Number of passed tests'
                });

                metrics.push({
                    name: 'test_failed',
                    value: testResults.failed || 0,
                    type: 'gauge',
                    description: 'Number of failed tests'
                });

                metrics.push({
                    name: 'test_duration_ms',
                    value: testResults.duration || 0,
                    type: 'gauge',
                    description: 'Test execution duration in milliseconds'
                });
            }

            // Collect security scan metrics
            if (fs.existsSync('security-policy-report.json')) {
                const securityReport = JSON.parse(fs.readFileSync('security-policy-report.json', 'utf8'));

                if (securityReport.summary?.vulnerabilities) {
                    const vulns = securityReport.summary.vulnerabilities;

                    metrics.push({
                        name: 'security_vulnerabilities_critical',
                        value: vulns.critical || 0,
                        type: 'gauge',
                        description: 'Critical security vulnerabilities found'
                    });

                    metrics.push({
                        name: 'security_vulnerabilities_high',
                        value: vulns.high || 0,
                        type: 'gauge',
                        description: 'High security vulnerabilities found'
                    });

                    metrics.push({
                        name: 'security_vulnerabilities_medium',
                        value: vulns.medium || 0,
                        type: 'gauge',
                        description: 'Medium security vulnerabilities found'
                    });

                    metrics.push({
                        name: 'security_vulnerabilities_low',
                        value: vulns.low || 0,
                        type: 'gauge',
                        description: 'Low security vulnerabilities found'
                    });
                }

                metrics.push({
                    name: 'security_scan_duration_ms',
                    value: this.calculateDuration(securityReport.timestamp, new Date().toISOString()),
                    type: 'gauge',
                    description: 'Security scan duration in milliseconds'
                });
            }

            console.log(`📊 Collected ${metrics.length} performance metrics`);
            return metrics;

        } catch (error) {
            console.error(`❌ Error collecting metrics: ${error.message}`);
            return [];
        }
    }

    /**
     * Calculate duration between two ISO timestamps
     */
    calculateDuration(startTime, endTime) {
        if (!startTime || !endTime) return 0;

        const start = new Date(startTime);
        const end = new Date(endTime);
        return end - start;
    }

    /**
     * Make HTTP request
     */
    async makeRequest(method, url, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'GitHub-Actions-APM-Integration/1.0',
                    ...headers
                },
                timeout: 30000
            };

            if (data) {
                const payload = typeof data === 'string' ? data : JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(payload);
            }

            const req = client.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = responseData ? JSON.parse(responseData) : {};
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, data: result, status: res.statusCode });
                        } else {
                            resolve({ success: false, error: `HTTP ${res.statusCode}: ${responseData}`, status: res.statusCode });
                        }
                    } catch (error) {
                        resolve({ success: false, error: `Failed to parse response: ${error.message}`, status: res.statusCode });
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data) {
                const payload = typeof data === 'string' ? data : JSON.stringify(data);
                req.write(payload);
            }

            req.end();
        });
    }

    /**
     * Execute APM integration
     */
    async execute() {
        console.log('🚀 Starting APM integration...');

        const results = {
            metrics: {
                collected: 0,
                datadog: { success: false, metrics: 0 },
                newRelic: { success: false, metrics: 0 },
                prometheus: { success: false, metrics: 0 }
            },
            grafana: { success: false },
            errors: []
        };

        try {
            // Collect metrics
            const metrics = this.collectGitHubActionsMetrics();
            results.metrics.collected = metrics.length;

            if (metrics.length === 0) {
                console.log('⚠️  No metrics collected to send');
                return results;
            }

            // Send to Datadog
            const datadogResult = await this.sendDatadogMetrics(metrics);
            results.metrics.datadog = datadogResult;

            // Send to New Relic
            const newRelicResult = await this.sendNewRelicMetrics(metrics);
            results.metrics.newRelic = newRelicResult;

            // Send to Prometheus
            const prometheusResult = await this.sendPrometheusMetrics(metrics);
            results.metrics.prometheus = prometheusResult;

            // Create Grafana dashboard
            const grafanaDashboard = {
                title: 'GitHub Actions Performance Dashboard',
                panels: [
                    {
                        title: 'Workflow Execution Time',
                        type: 'graph',
                        targets: [
                            {
                                expr: 'github_actions_workflow_job_execution',
                                legendFormat: '{{workflow}} - {{status}}'
                            }
                        ],
                        gridPos: { h: 8, w: 12, x: 0, y: 0 }
                    },
                    {
                        title: 'Security Vulnerabilities',
                        type: 'singlestat',
                        targets: [
                            {
                                expr: 'github_actions_security_vulnerabilities_critical',
                                legendFormat: 'Critical'
                            }
                        ],
                        gridPos: { h: 8, w: 6, x: 12, y: 0 }
                    },
                    {
                        title: 'Test Results',
                        type: 'graph',
                        targets: [
                            {
                                expr: 'github_actions_test_passed',
                                legendFormat: 'Passed'
                            },
                            {
                                expr: 'github_actions_test_failed',
                                legendFormat: 'Failed'
                            }
                        ],
                        gridPos: { h: 8, w: 12, x: 0, y: 8 }
                    },
                    {
                        title: 'Build Performance',
                        type: 'graph',
                        targets: [
                            {
                                expr: 'github_actions_build_duration_ms',
                                legendFormat: 'Build Duration (ms)'
                            },
                            {
                                expr: 'github_actions_build_artifact_size_bytes',
                                legendFormat: 'Artifact Size (bytes)'
                            }
                        ],
                        gridPos: { h: 8, w: 12, x: 12, y: 8 }
                    }
                ],
                time: {
                    from: 'now-24h',
                    to: 'now'
                },
                refresh: '1m'
            };

            const grafanaResult = await this.createGrafanaDashboard(grafanaDashboard);
            results.grafana = grafanaResult;

            console.log('✅ APM integration completed');
            return results;

        } catch (error) {
            console.error(`❌ APM integration error: ${error.message}`);
            results.errors.push(error.message);
            return results;
        }
    }
}

// Main execution
if (require.main === module) {
    const config = {
        datadogApiKey: process.env.DATADOG_API_KEY,
        datadogAppKey: process.env.DATADOG_APP_KEY,
        newRelicApiKey: process.env.NEW_RELIC_API_KEY,
        prometheusGateway: process.env.PROMETHEUS_GATEWAY_URL,
        grafanaUrl: process.env.GRAFANA_URL,
        grafanaApiKey: process.env.GRAFANA_API_KEY
    };

    const apm = new APMIntegration(config);

    // Parse command line arguments
    const command = process.argv[2] || 'execute';

    switch (command) {
        case 'collect':
            const metrics = apm.collectGitHubActionsMetrics();
            console.log(JSON.stringify(metrics, null, 2));
            break;
        case 'execute':
            apm.execute().then(result => {
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.errors.length > 0 ? 1 : 0);
            }).catch(error => {
                console.error(`❌ Execution error: ${error.message}`);
                process.exit(1);
            });
            break;
        default:
            console.error(`❌ Unknown command: ${command}`);
            console.log('Usage: node apm-integration.js [collect|execute]');
            process.exit(1);
    }
}

module.exports = APMIntegration;