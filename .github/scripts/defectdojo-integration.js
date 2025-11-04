#!/usr/bin/env node

/**
 * Enhanced DefectDojo Integration for GitHub Actions
 * Auto-creates products and engagements, uploads security scan results
 * Enhanced with GitHub Actions specific metadata and error handling
 */

const fs = require('fs');
const https = require('https');
const http = require('http');

class DefectDojoIntegration {
    constructor(config) {
        this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
        this.apiKey = config.apiKey;
        this.projectName = config.projectName || process.env.GITHUB_REPOSITORY?.split('/')[1] || 'unknown-project';
        this.engagementName = config.engagementName || `GitHub Actions CI/CD - ${process.env.GITHUB_REF_NAME || 'main'}`;
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
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'GitHub-Actions-DefectDojo-Integration/1.0'
        };

        console.log('🔗 Enhanced DefectDojo Integration');
        console.log(`   URL: ${this.baseUrl}`);
        console.log(`   Project: ${this.projectName}`);
        console.log(`   Engagement: ${this.engagementName}`);
        console.log(`   Auto-create: ${this.autoCreate}`);
        console.log(`   Repository: ${this.metadata.repository}`);
    }

    /**
     * Make HTTP request to DefectDojo API
     */
    async makeRequest(method, path, data = null, retries = 3) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}/api/v2${path}`;
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
     * Find or create product
     */
    async findOrCreateProduct() {
        try {
            console.log('🔍 Looking for existing product...');

            // Search for product
            const searchResponse = await this.makeRequest(
                'GET',
                `/products/?name=${encodeURIComponent(this.projectName)}`
            );

            if (searchResponse.status === 200 && searchResponse.data.results?.length > 0) {
                const product = searchResponse.data.results[0];
                console.log(`✅ Found existing product: ${product.name} (ID: ${product.id})`);
                return product;
            }

            // Create new product
            if (!this.autoCreate) {
                throw new Error('Product not found and auto-creation is disabled');
            }

            console.log('🆕 Creating new product...');
            const productData = {
                name: this.projectName,
                description: `Auto-created product for ${this.projectName}\n\n**GitHub Actions Integration**\n- Repository: ${this.metadata.repository}\n- Commit: ${this.metadata.commit}\n- Workflow: ${this.metadata.workflow}\n- Run ID: ${this.metadata.runId}\n- Actor: ${this.metadata.actor}\n- Repository URL: ${this.metadata.repositoryUrl}\n- Run URL: ${this.metadata.runUrl}`,
                prod_type: 1, // Web Application
                tags: [
                    'github-actions',
                    'automated',
                    'ci-cd',
                    this.metadata.repository?.split('/')[1] || 'unknown',
                    this.metadata.branch || 'unknown'
                ]
            };

            const createResponse = await this.makeRequest('POST', '/products/', productData);

            if (createResponse.status === 201) {
                console.log(`✅ Created new product: ${this.projectName} (ID: ${createResponse.data.id})`);
                return createResponse.data;
            } else {
                throw new Error(`Failed to create product: ${createResponse.status} - ${JSON.stringify(createResponse.data)}`);
            }
        } catch (error) {
            console.error(`❌ Product creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Find or create engagement
     */
    async findOrCreateEngagement(productId) {
        try {
            console.log('🔍 Looking for existing engagement...');

            // Search for engagement with today's date
            const today = new Date().toISOString().split('T')[0];
            const searchResponse = await this.makeRequest(
                'GET',
                `/engagements/?name=${encodeURIComponent(this.engagementName)}&product=${productId}`
            );

            if (searchResponse.status === 200 && searchResponse.data.results?.length > 0) {
                // Check for engagement with today's date
                const todayEngagement = searchResponse.data.results.find(eng =>
                    eng.target_start?.startsWith(today)
                );

                if (todayEngagement) {
                    console.log(`✅ Found existing engagement: ${todayEngagement.name} (ID: ${todayEngagement.id})`);
                    return todayEngagement;
                }
            }

            // Create new engagement
            if (!this.autoCreate) {
                throw new Error('Engagement not found and auto-creation is disabled');
            }

            console.log('🆕 Creating new engagement...');
            const engagementData = {
                name: this.engagementName,
                description: `Auto-created engagement for GitHub Actions pipeline run\n\n**Pipeline Details**\n- Repository: ${this.metadata.repository}\n- Commit: ${this.metadata.commit}\n- Branch: ${this.metadata.branch}\n- Workflow: ${this.metadata.workflow}\n- Run ID: ${this.metadata.runId}\n- Actor: ${this.metadata.actor}\n\n**Repository**: ${this.metadata.repositoryUrl}\n**Run**: ${this.metadata.runUrl}`,
                product: productId,
                target_start: this.metadata.timestamp,
                target_end: this.metadata.timestamp,
                status: 'In Progress',
                engagement_type: 'CI/CD',
                tags: [
                    'github-actions',
                    'automated',
                    'ci-cd',
                    this.metadata.runId,
                    this.metadata.commit,
                    this.metadata.branch
                ]
            };

            const createResponse = await this.makeRequest('POST', '/engagements/', engagementData);

            if (createResponse.status === 201) {
                console.log(`✅ Created new engagement: ${this.engagementName} (ID: ${createResponse.data.id})`);
                return createResponse.data;
            } else {
                throw new Error(`Failed to create engagement: ${createResponse.status} - ${JSON.stringify(createResponse.data)}`);
            }
        } catch (error) {
            console.error(`❌ Engagement creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Determine scan type based on filename
     */
    getScanType(filename) {
        const scanTypes = {
            'gitleaks.sarif': 'Gitleaks Scan',
            'gitleaks.json': 'Gitleaks Scan',
            'semgrep.sarif': 'Semgrep JSON Report',
            'semgrep.json': 'Semgrep JSON Report',
            'semgrep_nodejs.json': 'Semgrep JSON Report',
            'trivy-fs.sarif': 'Trivy Scan',
            'trivy-fs.json': 'Trivy Scan',
            'trivy-docker.sarif': 'Trivy Scan',
            'trivy-docker.json': 'Trivy Scan',
            'trivy-results.sarif': 'Trivy Scan',
            'dependency-track-findings.json': 'Dependency-Track Scan',
            'syft-sbom.cdx.json': 'Software Bill of Materials (SBOM)',
            'docker-sbom.cdx.json': 'Software Bill of Materials (SBOM)',
            'njsscan.sarif': 'SARIF',
            'snyk.sarif': 'Snyk Scan',
            'security-summary.json': 'Security Summary Report',
            'security-policy-report.json': 'Security Policy Report'
        };
        return scanTypes[filename] || 'Generic Findings Import';
    }

    /**
     * Upload single scan result to DefectDojo
     */
    async uploadReport(filePath, engagementId) {
        try {
            if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
                console.log(`⚠️  File not found or empty: ${filePath}`);
                return { success: false, reason: 'File not found or empty' };
            }

            const scanType = this.getScanType(filePath);
            console.log(`📤 Uploading ${filePath} as ${scanType}`);

            const formData = new URLSearchParams();
            formData.append('scan_type', scanType);
            formData.append('minimum_severity', 'Low');
            formData.append('engagement', engagementId);
            formData.append('lead', '1'); // Default lead
            formData.append('verified', 'false'); // Let DefectDojo auto-verify
            formData.append('active', 'true');
            formData.append('environment', this.metadata.branch);
            formData.append('version', this.metadata.commit.substring(0, 8));
            formData.append('build_id', this.metadata.runId);
            formData.append('commit_hash', this.metadata.commit);
            formData.append('branch_tag', this.metadata.branch);
            formData.append('source_code_management_uri', this.metadata.repositoryUrl);
            formData.append('deduplication_on_engagement', 'true');

            // Add file
            const fileContent = fs.readFileSync(filePath);
            const boundary = '----DefectDojoFormBoundary' + Math.random().toString(36);
            const formDataWithFile = this.createMultipartFormData(formData, filePath, fileContent, boundary);

            const uploadResponse = await this.makeRequest(
                'POST',
                '/import-scan/',
                formDataWithFile.data,
                1 // No retries for file uploads
            );

            if (uploadResponse.status === 201) {
                console.log(`✅ Successfully uploaded ${filePath} (Test ID: ${uploadResponse.data.test || 'N/A'})`);
                return {
                    success: true,
                    testId: uploadResponse.data.test,
                    scanType: scanType
                };
            } else {
                console.log(`❌ Failed to upload ${filePath}: ${uploadResponse.status} - ${JSON.stringify(uploadResponse.data)}`);
                return {
                    success: false,
                    reason: `HTTP ${uploadResponse.status}: ${JSON.stringify(uploadResponse.data)}`
                };
            }
        } catch (error) {
            console.error(`❌ Exception uploading ${filePath}: ${error.message}`);
            return { success: false, reason: error.message };
        }
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
        data += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
        data += `Content-Type: application/json\r\n\r\n`;
        data += fileContent;
        data += `\r\n--${boundary}--\r\n`;

        return {
            data,
            contentType: `multipart/form-data; boundary=${boundary}`
        };
    }

    /**
     * Upload multiple reports to DefectDojo
     */
    async uploadAllReports(reportFiles, engagementId) {
        console.log(`🚀 Starting DefectDojo upload for ${reportFiles.length} reports`);

        const results = {
            successful: [],
            failed: [],
            total: reportFiles.length
        };

        for (const reportFile of reportFiles) {
            const result = await this.uploadReport(reportFile, engagementId);

            if (result.success) {
                results.successful.push({
                    file: reportFile,
                    testId: result.testId,
                    scanType: result.scanType
                });
            } else {
                results.failed.push({
                    file: reportFile,
                    reason: result.reason
                });
            }
        }

        console.log('\n📊 Upload Summary:');
        console.log(`   ✅ Successful uploads: ${results.successful.length}`);
        console.log(`   ❌ Failed uploads: ${results.failed.length}`);
        console.log(`   📈 Total files processed: ${results.total}`);

        if (results.failed.length > 0) {
            console.log('\n❌ Failed Uploads:');
            results.failed.forEach(failure => {
                console.log(`   - ${failure.file}: ${failure.reason}`);
            });
        }

        if (results.successful.length > 0) {
            console.log('\n✅ Successful Uploads:');
            results.successful.forEach(success => {
                console.log(`   - ${success.file}: Test ID ${success.testId} (${success.scanType})`);
            });
        }

        return results;
    }

    /**
     * Execute DefectDojo integration
     */
    async execute(reportFiles = []) {
        try {
            console.log('🔗 DefectDojo Integration Started');
            console.log('='.repeat(50));

            // Default report files if none provided
            if (reportFiles.length === 0) {
                reportFiles = [
                    'gitleaks.sarif',
                    'semgrep.sarif',
                    'semgrep_nodejs.json',
                    'trivy-fs.sarif',
                    'trivy-docker.sarif',
                    'trivy-results.sarif',
                    'dependency-track-findings.json',
                    'security-summary.json',
                    'security-policy-report.json',
                    'njsscan.sarif',
                    'snyk.sarif'
                ].filter(file => fs.existsSync(file));
            }

            if (reportFiles.length === 0) {
                console.log('⚠️  No security report files found to upload');
                return { success: false, reason: 'No report files found' };
            }

            // Find or create product
            const product = await this.findOrCreateProduct();
            const productId = product.id;

            // Find or create engagement
            const engagement = await this.findOrCreateEngagement(productId);
            const engagementId = engagement.id;

            console.log(`\n📋 Using Product ID: ${productId}, Engagement ID: ${engagementId}`);

            // Upload all reports
            const uploadResults = await this.uploadAllReports(reportFiles, engagementId);

            // Generate integration report
            const report = {
                timestamp: new Date().toISOString(),
                integration: 'defectdojo',
                metadata: this.metadata,
                product: {
                    id: productId,
                    name: this.projectName
                },
                engagement: {
                    id: engagementId,
                    name: this.engagementName
                },
                results: uploadResults,
                success: uploadResults.successful.length > 0,
                summary: {
                    uploaded: uploadResults.successful.length,
                    failed: uploadResults.failed.length,
                    total: uploadResults.total
                }
            };

            // Write integration report
            fs.writeFileSync('defectdojo-integration-report.json', JSON.stringify(report, null, 2));

            console.log('\n📄 DefectDojo integration report created: defectdojo-integration-report.json');

            if (uploadResults.successful.length > 0) {
                console.log('🎉 DefectDojo integration completed successfully!');
                return {
                    success: true,
                    productId,
                    engagementId,
                    uploads: uploadResults.successful.length,
                    report
                };
            } else {
                console.log('💥 DefectDojo integration failed - no successful uploads');
                return {
                    success: false,
                    reason: 'No successful uploads',
                    report
                };
            }

        } catch (error) {
            console.error(`❌ DefectDojo integration error: ${error.message}`);

            // Write error report
            const errorReport = {
                timestamp: new Date().toISOString(),
                integration: 'defectdojo',
                metadata: this.metadata,
                error: {
                    message: error.message,
                    stack: error.stack
                },
                success: false
            };

            fs.writeFileSync('defectdojo-integration-error.json', JSON.stringify(errorReport, null, 2));

            return { success: false, reason: error.message, errorReport };
        }
    }
}

// Main execution
if (require.main === module) {
    const config = {
        url: process.env.DEFECTDOJO_URL,
        apiKey: process.env.DEFECTDOJO_API_KEY,
        projectName: process.env.PROJECT_NAME,
        engagementName: process.env.DEFECTDOJO_ENGAGEMENT_NAME,
        autoCreate: process.env.DEFECTDOJO_AUTO_CREATE !== 'false'
    };

    if (!config.url || !config.apiKey) {
        console.error('❌ Missing required configuration:');
        console.error('   DEFECTDOJO_URL: ' + (config.url || 'NOT SET'));
        console.error('   DEFECTDOJO_API_KEY: ' + (config.apiKey ? 'SET' : 'NOT SET'));
        process.exit(1);
    }

    const integration = new DefectDojoIntegration(config);

    // Get report files from command line arguments or use defaults
    const reportFiles = process.argv.slice(2);

    integration.execute(reportFiles).then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error(`❌ Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = DefectDojoIntegration;