#!/usr/bin/env node

/**
 * Enhanced Dependency-Track Integration for GitHub Actions
 * Enhanced SBOM processing, vulnerability analysis, and findings retrieval
 */

const fs = require('fs');
const https = require('https');
const http = require('http');

class DependencyTrackIntegration {
    constructor(config) {
        this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
        this.apiKey = config.apiKey;
        this.projectName = config.projectName || process.env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown-project';
        this.projectVersion = config.projectVersion || `${process.env.GITHUB_REF_NAME || 'main'}-${process.env.GITHUB_SHA?.substring(0, 8) || 'unknown'}`;
        this.autoCreate = config.autoCreate !== false;

        // GitHub Actions specific metadata
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
            timestamp: new Date().toISOString()
        };

        this.headers = {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-Actions-Dependency-Track-Integration/1.0'
        };

        console.log('🔗 Enhanced Dependency-Track Integration');
        console.log(`   URL: ${this.baseUrl}`);
        console.log(`   Project: ${this.projectName}`);
        console.log(`   Version: ${this.projectVersion}`);
        console.log(`   Auto-create: ${this.autoCreate}`);
        console.log(`   Repository: ${this.metadata.repository}`);
    }

    /**
     * Make HTTP request to Dependency-Track API
     */
    async makeRequest(method, path, data = null, retries = 3) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}/api/v1${path}`;
            const isHttps = url.startsWith('https://');
            const client = isHttps ? https : http;

            const options = {
                method,
                headers: this.headers,
                timeout: 30000 // 30 seconds timeout
            };

            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
            }

            const req = client.request(url, options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = res.statusCode >= 200 && res.statusCode < 300
                            ? JSON.parse(responseData)
                            : responseData;
                        resolve({ status: res.statusCode, data: result });
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
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
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    /**
     * Find or create project
     */
    async findOrCreateProject() {
        try {
            console.log('🔍 Looking for existing project...');

            // Search for project
            const searchResponse = await this.makeRequest(
                'GET',
                `/project/lookup?name=${encodeURIComponent(this.projectName)}`
            );

            if (searchResponse.status === 200 && searchResponse.data) {
                console.log(`✅ Found existing project: ${searchResponse.data.name} (ID: ${searchResponse.data.uuid})`);
                return searchResponse.data;
            }

            // Create new project
            if (!this.autoCreate) {
                throw new Error('Project not found and auto-creation is disabled');
            }

            console.log('🆕 Creating new project...');
            const projectData = {
                name: this.projectName,
                description: `Auto-created project for ${this.projectName}\n\n**GitHub Actions Integration**\n- Repository: ${this.metadata.repository}\n- Commit: ${this.metadata.commit}\n- Workflow: ${this.metadata.workflow}\n- Run ID: ${this.metadata.runId}\n- Actor: ${this.metadata.actor}\n- Repository URL: ${this.metadata.repositoryUrl}\n- Run URL: ${this.metadata.runUrl}`,
                version: this.projectVersion,
                active: true,
                tags: [
                    'github-actions',
                    'automated',
                    'ci-cd',
                    this.metadata.repository?.split('/')[1] || 'unknown',
                    this.metadata.branch || 'unknown'
                ]
            };

            const createResponse = await this.makeRequest('POST', '/project', projectData);

            if (createResponse.status === 201) {
                console.log(`✅ Created new project: ${this.projectName} (ID: ${createResponse.data.uuid})`);
                return createResponse.data;
            } else {
                throw new Error(`Failed to create project: ${createResponse.status} - ${JSON.stringify(createResponse.data)}`);
            }
        } catch (error) {
            console.error(`❌ Project creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Upload SBOM to Dependency-Track
     */
    async uploadSBOM(project, sbomFilePath) {
        try {
            if (!fs.existsSync(sbomFilePath) || fs.statSync(sbomFilePath).size === 0) {
                throw new Error(`SBOM file not found or empty: ${sbomFilePath}`);
            }

            console.log(`📤 Uploading SBOM: ${sbomFilePath}`);

            const formData = new URLSearchParams();
            formData.append('projectName', project.name);
            formData.append('projectVersion', this.projectVersion);
            formData.append('autoCreate', 'true');
            formData.append('bomName', `GitHub Actions SBOM - ${this.metadata.runId}`);
            formData.append('bomVersion', this.metadata.timestamp);

            // Read SBOM file
            const sbomContent = fs.readFileSync(sbomFilePath);
            const boundary = '----DependencyTrackFormBoundary' + Math.random().toString(36);
            const formDataWithFile = this.createMultipartFormData(formData, sbomFilePath, sbomContent, boundary);

            // Update headers for multipart form data
            const multipartHeaders = {
                ...this.headers,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': formDataWithFile.data.length
            };

            const uploadResponse = await this.makeMultipartRequest(
                'POST',
                '/bom',
                formDataWithFile.data,
                multipartHeaders
            );

            if (uploadResponse.status === 202) {
                console.log(`✅ SBOM uploaded successfully`);
                console.log(`   Project UUID: ${uploadResponse.data.uuid}`);
                return {
                    success: true,
                    projectUuid: uploadResponse.data.uuid,
                    bomUuid: uploadResponse.data.bomUuid,
                    processing: uploadResponse.data.processing
                };
            } else {
                throw new Error(`Failed to upload SBOM: ${uploadResponse.status} - ${JSON.stringify(uploadResponse.data)}`);
            }
        } catch (error) {
            console.error(`❌ SBOM upload failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Make multipart form data request
     */
    async makeMultipartRequest(method, path, data, headers) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}/api/v1${path}`;
            const isHttps = url.startsWith('https://');
            const client = isHttps ? https : http;

            const options = {
                method,
                headers,
                timeout: 60000 // 60 seconds timeout for SBOM uploads
            };

            const req = client.request(url, options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = res.statusCode >= 200 && res.statusCode < 300
                            ? JSON.parse(responseData)
                            : responseData;
                        resolve({ status: res.statusCode, data: result });
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
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
     * Create multipart form data for file upload
     */
    createMultipartFormData(formData, filename, fileContent, boundary) {
        let data = '';

        // Add form fields
        for (const [key, value] of formData.entries()) {
            data += `--${boundary}\r\n`;
            data += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
            data += `${value}\r\n`;
        }

        // Add file
        data += `--${boundary}\r\n`;
        data += `Content-Disposition: form-data; name="bom"; filename="${filename}"\r\n`;
        data += `Content-Type: application/json\r\n\r\n`;
        data += fileContent;
        data += `\r\n--${boundary}--\r\n`;

        return {
            data,
            contentType: `multipart/form-data; boundary=${boundary}`
        };
    }

    /**
     * Wait for SBOM processing and retrieve findings
     */
    async waitForProcessing(projectUuid, maxWaitTime = 120000, checkInterval = 10000) {
        console.log('⏳ Waiting for SBOM analysis...');

        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < maxWaitTime) {
            attempts++;
            console.log(`   Checking analysis status (attempt ${attempts})...`);

            try {
                const statusResponse = await this.makeRequest(
                    'GET',
                    `/bom/${projectUuid}/processing`
                );

                if (statusResponse.status === 200) {
                    const processing = statusResponse.data.processing;
                    console.log(`   Processing status: ${processing ? 'In Progress' : 'Completed'}`);

                    if (!processing) {
                        console.log('✅ SBOM analysis completed');
                        return true;
                    }
                }
            } catch (error) {
                console.warn(`   Status check failed: ${error.message}`);
            }

            await this.sleep(checkInterval);
        }

        console.log('⚠️  Analysis timeout - proceeding with findings retrieval');
        return false;
    }

    /**
     * Retrieve vulnerability findings
     */
    async retrieveFindings(projectUuid) {
        try {
            console.log('📊 Retrieving vulnerability findings...');

            const findingsResponse = await this.makeRequest(
                'GET',
                `/finding/project/${projectUuid}`
            );

            if (findingsResponse.status === 200) {
                const findings = Array.isArray(findingsResponse.data) ? findingsResponse.data : [];
                console.log(`✅ Retrieved ${findings.length} vulnerability findings`);

                // Analyze findings
                const analysis = this.analyzeFindings(findings);

                console.log('\n📈 Vulnerability Analysis:');
                console.log(`   🔴 CRITICAL: ${analysis.critical}`);
                console.log(`   🟠 HIGH: ${analysis.high}`);
                console.log(`   🟡 MEDIUM: ${analysis.medium}`);
                console.log(`   🟢 LOW: ${analysis.low}`);
                console.log(`   📊 Total: ${analysis.total}`);

                // Write findings report
                const report = {
                    timestamp: new Date().toISOString(),
                    integration: 'dependency-track',
                    metadata: this.metadata,
                    project: {
                        uuid: projectUuid,
                        name: this.projectName,
                        version: this.projectVersion
                    },
                    findings,
                    analysis,
                    summary: {
                        total: analysis.total,
                        critical: analysis.critical,
                        high: analysis.high,
                        medium: analysis.medium,
                        low: analysis.low
                    }
                };

                fs.writeFileSync('dependency-track-findings-report.json', JSON.stringify(report, null, 2));

                // Generate top findings list
                if (findings.length > 0) {
                    console.log('\n🔝 Top Findings:');
                    findings.slice(0, 10).forEach((finding, index) => {
                        const vuln = finding.vulnerability || {};
                        const component = finding.component || {};
                        console.log(`   ${index + 1}. ${vuln.vulnId || 'Unknown'} - ${component.name || 'Unknown'} (${vuln.severity || 'Unknown'})`);
                    });
                }

                return {
                    success: true,
                    findings,
                    analysis,
                    report
                };
            } else {
                throw new Error(`Failed to retrieve findings: ${findingsResponse.status}`);
                }
        } catch (error) {
            console.error(`❌ Findings retrieval failed: ${error.message}`);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Analyze vulnerability findings
     */
    analyzeFindings(findings) {
        const analysis = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            total: findings.length
        };

        findings.forEach(finding => {
            const severity = (finding.vulnerability?.severity || 'unknown').toUpperCase();
            switch (severity) {
                case 'CRITICAL':
                    analysis.critical++;
                    break;
                case 'HIGH':
                    analysis.high++;
                    break;
                case 'MEDIUM':
                    analysis.medium++;
                    break;
                case 'LOW':
                    analysis.low++;
                    break;
            }
        });

        return analysis;
    }

    /**
     * Sleep helper function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute Dependency-Track integration
     */
    async execute(sbomFilePath = null) {
        try {
            console.log('🔗 Dependency-Track Integration Started');
            console.log('='.repeat(50));

            // Find or create project
            const project = await this.findOrCreateProject();
            const projectUuid = project.uuid;

            // Determine SBOM file path
            if (!sbomFilePath) {
                const possibleFiles = [
                    'syft-sbom.cdx.json',
                    'docker-sbom.cdx.json',
                    'sbom.cdx.json',
                    'generated-sbom.cdx.json'
                ];

                sbomFilePath = possibleFiles.find(file => fs.existsSync(file));

                if (!sbomFilePath) {
                    throw new Error('No SBOM file found. Available files: ' + possibleFiles.join(', '));
                }
            }

            // Upload SBOM
            const uploadResult = await this.uploadSBOM(project, sbomFilePath);

            if (uploadResult.success) {
                // Wait for processing
                await this.waitForProcessing(uploadResult.projectUuid);

                // Retrieve findings
                const findingsResult = await this.retrieveFindings(uploadResult.projectUuid);

                if (findingsResult.success) {
                    console.log('\n🎉 Dependency-Track integration completed successfully!');
                    return {
                        success: true,
                        projectUuid: uploadResult.projectUuid,
                        bomUuid: uploadResult.bomUuid,
                        findings: findingsResult.findings.length,
                        analysis: findingsResult.analysis,
                        report: findingsResult.report
                    };
                } else {
                    return {
                        success: false,
                        projectUuid: uploadResult.projectUuid,
                        bomUuid: uploadResult.bomUuid,
                        reason: findingsResult.reason
                    };
                }
            } else {
                return { success: false, reason: 'SBOM upload failed' };
            }

        } catch (error) {
            console.error(`❌ Dependency-Track integration error: ${error.message}`);

            // Write error report
            const errorReport = {
                timestamp: new Date().toISOString(),
                integration: 'dependency-track',
                metadata: this.metadata,
                error: {
                    message: error.message,
                    stack: error.stack
                },
                success: false
            };

            fs.writeFileSync('dependency-track-integration-error.json', JSON.stringify(errorReport, null, 2));

            return { success: false, reason: error.message, errorReport };
        }
    }
}

// Main execution
if (require.main === module) {
    const config = {
        url: process.env.DEPENDENCY_TRACK_URL,
        apiKey: process.env.DEPENDENCY_TRACK_API_KEY,
        projectName: process.env.PROJECT_NAME,
        projectVersion: process.env.PROJECT_VERSION,
        autoCreate: process.env.DEPENDENCY_TRACK_AUTO_CREATE !== 'false'
    };

    if (!config.url || !config.apiKey) {
        console.error('❌ Missing required configuration:');
        console.error('   DEPENDENCY_TRACK_URL: ' + (config.url || 'NOT SET'));
        console.error('   DEPENDENCY_TRACK_API_KEY: ' + (config.apiKey ? 'SET' : 'NOT SET'));
        process.exit(1);
    }

    const integration = new DependencyTrackIntegration(config);

    // Get SBOM file from command line argument or use auto-detection
    const sbomFilePath = process.argv[2];

    integration.execute(sbomFilePath).then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error(`❌ Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = DependencyTrackIntegration;