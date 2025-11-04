#!/usr/bin/env node

/**
 * Enhanced Slack Notifications for GitHub Actions
 * Provides rich context, actionable buttons, and formatted messages
 */

const https = require('https');

class SlackNotificationService {
    constructor(config) {
        this.webhookUrl = config.webhookUrl;
        this.channel = config.channel || process.env.SLACK_CHANNEL || '#security-alerts';
        this.username = config.username || 'GitHub Actions';
        this.iconEmoji = config.iconEmoji || ':robot_face:';

        // GitHub Actions metadata
        this.metadata = {
            repository: process.env.GITHUB_REPOSITORY || 'unknown',
            commit: process.env.GITHUB_SHA || 'unknown',
            branch: process.env.GITHUB_REF_NAME || 'unknown',
            workflow: process.env.GITHUB_WORKFLOW || 'unknown',
            runId: process.env.GITHUB_RUN_ID || 'unknown',
            actor: process.env.GITHUB_ACTOR || 'unknown',
            serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
            repositoryUrl: process.env.GITHUB_REPOSITORY ?
                `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}` : '',
            runUrl: process.env.GITHUB_REPOSITORY ?
                `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '',
            eventName: process.env.GITHUB_EVENT_NAME || 'unknown',
            timestamp: new Date().toISOString()
        };

        console.log('📱 Enhanced Slack Notification Service');
        console.log(`   Channel: ${this.channel}`);
        console.log(`   Repository: ${this.metadata.repository}`);
    }

    /**
     * Send message to Slack
     */
    async sendMessage(message, attachments = null) {
        try {
            const payload = {
                channel: this.channel,
                username: this.username,
                icon_emoji: this.iconEmoji,
                text: message,
                attachments: attachments
            };

            const response = await this.makeSlackRequest(payload);

            if (response.success) {
                console.log('✅ Slack notification sent successfully');
                return { success: true };
            } else {
                console.log(`❌ Slack notification failed: ${response.error}`);
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error(`❌ Slack notification error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Make HTTP request to Slack API
     */
    async makeSlackRequest(payload) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: 10000
            };

            const req = https.request(this.webhookUrl, options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        if (res.statusCode === 200) {
                            resolve({ success: true, data: result });
                        } else {
                            resolve({ success: false, error: `HTTP ${res.statusCode}: ${responseData}` });
                        }
                    } catch (error) {
                        resolve({ success: false, error: `Failed to parse response: ${error.message}` });
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

            req.write(data);
            req.end();
        });
    }

    /**
     * Create success notification
     */
    createSuccessNotification(context) {
        const message = `✅ **${context.action || 'Action Completed Successfully'}**`;

        const attachments = [{
            color: 'good',
            fields: [
                {
                    title: 'Repository',
                    value: this.metadata.repository,
                    short: true
                },
                {
                    title: 'Branch',
                    value: this.metadata.branch,
                    short: true
                },
                {
                    title: 'Commit',
                    value: `<${this.metadata.repositoryUrl}/commit/${this.metadata.commit}|${this.metadata.commit.substring(0, 8)}>`
                        .substring(0, 8),
                    short: true
                },
                {
                    title: 'Workflow',
                    value: context.workflow || this.metadata.workflow,
                    short: true
                }
            ],
            actions: [
                {
                    type: 'button',
                    text: 'View Run',
                    url: this.metadata.runUrl
                },
                {
                    type: 'button',
                    text: 'View Repository',
                    url: this.metadata.repositoryUrl
                }
            ],
            footer: `Triggered by ${this.metadata.actor}`,
            ts: Math.floor(Date.now() / 1000)
        }];

        return { message, attachments };
    }

    /**
     * Create failure notification
     */
    createFailureNotification(context) {
        const message = `🚨 **Pipeline Failure**`;

        const attachments = [{
            color: 'danger',
            fields: [
                {
                    title: 'Repository',
                    value: this.metadata.repository,
                    short: true
                },
                {
                    title: 'Branch',
                    value: this.metadata.branch,
                    short: true
                },
                {
                    title: 'Commit',
                    value: `<${this.metadata.repositoryUrl}/commit/${this.metadata.commit}|${this.metadata.commit.substring(0, 8)}>`
                        .substring(0, 8),
                    short: true
                },
                {
                    title: 'Workflow',
                    value: context.workflow || this.metadata.workflow,
                    short: true
                },
                {
                    title: 'Failed Stage',
                    value: context.stage || 'Unknown',
                    short: true
                },
                {
                    title: 'Actor',
                    value: this.metadata.actor,
                    short: true
                }
            ],
            actions: [
                {
                    type: 'button',
                    text: 'View Run',
                    url: this.metadata.runUrl
                },
                {
                    type: 'button',
                    text: 'View Repository',
                    url: this.metadata.repositoryUrl
                },
                {
                    type: 'button',
                    text: 'Create Issue',
                    url: `${this.metadata.repositoryUrl}/issues/new?title=${encodeURIComponent(
                        `Pipeline failure in ${context.stage || 'workflow'}`
                    )}`
                }
            ],
            footer: `Triggered by ${this.metadata.actor}`,
            ts: Math.floor(Date.now() / 1000)
        }];

        return { message, attachments };
    }

    /**
     * Create security scan notification
     */
    createSecurityNotification(context) {
        const message = `🔒 **${context.action || 'Security Scan Results'}**`;

        const color = context.status === 'passed' ? 'good' :
                      context.status === 'failed' ? 'danger' : 'warning';

        const attachments = [{
            color: color,
            fields: [
                {
                    title: 'Repository',
                    value: this.metadata.repository,
                    short: true
                },
                {
                    title: 'Commit',
                    value: `<${this.metadata.repositoryUrl}/commit/${this.metadata.commit}|${this.metadata.commit.substring(0, 8)}>`
                        .substring(0, 8),
                    short: true
                },
                {
                    title: 'Branch',
                    value: this.metadata.branch,
                    short: true
                },
                {
                    title: 'Status',
                    value: context.status.toUpperCase(),
                    short: true
                }
            ]
        }];

        // Add vulnerability summary if available
        if (context.vulnerabilities) {
            attachments[0].fields.push({
                title: 'Vulnerabilities',
                value: `🔴 Critical: ${context.vulnerabilities.critical || 0} | ` +
                         `🟠 High: ${context.vulnerabilities.high || 0} | ` +
                         `🟡 Medium: ${context.vulnerabilities.medium || 0} | ` +
                         `🟢 Low: ${context.vulnerabilities.low || 0}`,
                short: false
            });
        }

        // Add policy violations if available
        if (context.policyViolations && context.policyViolations.length > 0) {
            attachments[0].fields.push({
                title: 'Policy Violations',
                value: `${context.policyViolations.length} violations detected`,
                short: false
            });
        }

        attachments[0].actions = [
            {
                type: 'button',
                text: 'View Run',
                url: this.metadata.runUrl
            },
            {
                type: 'button',
                text: 'View Repository',
                url: this.metadata.repositoryUrl
            }
        ];

        attachments[0].footer = `Security scan by ${this.metadata.workflow}`;
        attachments[0].ts = Math.floor(Date.now() / 1000);

        return { message, attachments };
    }

    /**
     * Create deployment notification
     */
    createDeploymentNotification(context) {
        const message = context.status === 'success'
            ? `🚀 **Deployment Successful**`
            : `❌ **Deployment Failed**`;

        const color = context.status === 'success' ? 'good' : 'danger';

        const attachments = [{
            color: color,
            fields: [
                {
                    title: 'Repository',
                    value: this.metadata.repository,
                    short: true
                },
                {
                    title: 'Environment',
                    value: context.environment || 'Unknown',
                    short: true
                },
                {
                    title: 'Commit',
                    value: `<${this.metadata.repositoryUrl}/commit/${this.metadata.commit}|${this.metadata.commit.substring(0, 8)}>`
                        .substring(0, 8),
                    short: true
                },
                {
                    title: 'Status',
                    value: context.status.toUpperCase(),
                    short: true
                }
            ]
        }];

        // Add deployment details if available
        if (context.details) {
            attachments[0].fields.push({
                title: 'Details',
                value: context.details,
                short: false
            });
        }

        attachments[0].actions = [
            {
                type: 'button',
                text: context.status === 'success' ? 'View Application' : 'View Logs',
                url: context.applicationUrl || this.metadata.runUrl
            },
            {
                type: 'button',
                text: 'View Repository',
                url: this.metadata.repositoryUrl
            }
        ];

        attachments[0].footer = `Deployed by ${this.metadata.actor}`;
        attachments[0].ts = Math.floor(Date.now() / 1000);

        return { message, attachments };
    }

    /**
     * Create integration notification
     */
    createIntegrationNotification(context) {
        const message = `📤 **${context.integration.toUpperCase()} Integration**`;

        const color = context.success ? 'good' : 'danger';

        const attachments = [{
            color: color,
            fields: [
                {
                    title: 'Integration',
                    value: context.integration.toUpperCase(),
                    short: true
                },
                {
                    title: 'Repository',
                    value: this.metadata.repository,
                    short: true
                },
                {
                    title: 'Commit',
                    value: `<${this.metadata.repositoryUrl}/commit/${this.metadata.commit}|${this.metadata.commit.substring(0, 8)}>`
                        .substring(0, 8),
                    short: true
                },
                {
                    title: 'Status',
                    value: context.success ? 'Success' : 'Failed',
                    short: true
                }
            ]
        }];

        // Add integration-specific details
        if (context.details) {
            Object.entries(context.details).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    attachments[0].fields.push({
                        title: key,
                        value: String(value),
                        short: true
                    });
                }
            });
        }

        attachments[0].actions = [
            {
                type: 'button',
                text: 'View Run',
                url: this.metadata.runUrl
            }
        ];

        attachments[0].footer = `Integration by ${this.metadata.workflow}`;
        attachments[0].ts = Math.floor(Date.now() / 1000);

        return { message, attachments };
    }

    /**
     * Execute notification based on context
     */
    async execute(context) {
        let notification;

        switch (context.type) {
            case 'success':
                notification = this.createSuccessNotification(context);
                break;
            case 'failure':
                notification = this.createFailureNotification(context);
                break;
            case 'security':
                notification = this.createSecurityNotification(context);
                break;
            case 'deployment':
                notification = this.createDeploymentNotification(context);
                break;
            case 'integration':
                notification = this.createIntegrationNotification(context);
                break;
            default:
                console.warn(`⚠️ Unknown notification type: ${context.type}`);
                return { success: false, error: 'Unknown notification type' };
        }

        return await this.sendMessage(notification.message, notification.attachments);
    }
}

// Main execution
if (require.main === module) {
    const config = {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL,
        username: process.env.SLACK_USERNAME,
        iconEmoji: process.env.SLACK_ICON_EMOJI
    };

    if (!config.webhookUrl) {
        console.log('⚠️  Slack webhook not configured, skipping notification');
        process.exit(0);
    }

    const notificationService = new SlackNotificationService(config);

    // Parse context from command line arguments
    const contextJson = process.argv[2];
    if (!contextJson) {
        console.error('❌ No context provided');
        process.exit(1);
    }

    let context;
    try {
        context = JSON.parse(contextJson);
    } catch (error) {
        console.error(`❌ Failed to parse context: ${error.message}`);
        process.exit(1);
    }

    notificationService.execute(context).then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error(`❌ Notification error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = SlackNotificationService;