#!/usr/bin/env node

/**
 * Performance Optimization Script for GitHub Actions
 * Analyzes and optimizes workflow performance, resource usage, and build times
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PerformanceOptimizer {
    constructor() {
        this.projectRoot = process.cwd();
        this.metrics = {
            buildTime: 0,
            testTime: 0,
            securityScanTime: 0,
            deploymentTime: 0,
            totalTime: 0,
            memoryUsage: process.memoryUsage(),
            diskUsage: this.getDiskUsage(),
            networkTransfers: []
        };

        console.log('⚡ Performance Optimization Service');
        console.log(`   Project: ${path.basename(this.projectRoot)}`);
    }

    /**
     * Get disk usage information
     */
    getDiskUsage() {
        try {
            const stats = execSync('du -sh .', { encoding: 'utf8' });
            return stats.trim().split('\t')[0];
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Analyze Node.js dependencies for performance
     */
    analyzeDependencies() {
        console.log('📦 Analyzing Node.js dependencies...');

        const analysis = {
            packageSize: 0,
            dependencyCount: 0,
            devDependencyCount: 0,
            duplicateDependencies: [],
            largeDependencies: [],
            optimizationSuggestions: []
        };

        try {
            if (fs.existsSync('package.json')) {
                const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

                const deps = Object.keys(packageJson.dependencies || {});
                const devDeps = Object.keys(packageJson.devDependencies || {});

                analysis.dependencyCount = deps.length;
                analysis.devDependencyCount = devDeps.length;

                // Check for large dependencies
                if (fs.existsSync('node_modules')) {
                    const packageStats = this.getPackageSizes();

                    // Find large packages (>10MB)
                    analysis.largeDependencies = packageStats
                        .filter(pkg => pkg.size > 10 * 1024 * 1024)
                        .map(pkg => ({
                            name: pkg.name,
                            size: this.formatBytes(pkg.size),
                            sizeBytes: pkg.size
                        }));

                    // Check for duplicate dependencies
                    analysis.duplicateDependencies = this.findDuplicateDependencies(packageStats);

                    // Generate optimization suggestions
                    analysis.optimizationSuggestions = this.generateDependencyOptimizationSuggestions(
                        analysis, packageStats
                    );
                }
            }

            console.log(`   Dependencies: ${analysis.dependencyCount}`);
            console.log(`   Dev Dependencies: ${analysis.devDependencyCount}`);
            console.log(`   Large packages: ${analysis.largeDependencies.length}`);

            return analysis;
        } catch (error) {
            console.error(`❌ Error analyzing dependencies: ${error.message}`);
            return analysis;
        }
    }

    /**
     * Get package sizes from node_modules
     */
    getPackageSizes() {
        const packageStats = [];
        const nodeModulesPath = path.join(this.projectRoot, 'node_modules');

        if (!fs.existsSync(nodeModulesPath)) {
            return packageStats;
        }

        try {
            const packages = fs.readdirSync(nodeModulesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('@'))
                .map(dirent => dirent.name);

            // Include scoped packages
            const scopedDirs = fs.readdirSync(nodeModulesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('@'))
                .map(dirent => dirent.name);

            for (const scopedDir of scopedDirs) {
                const scopedPath = path.join(nodeModulesPath, scopedDir);
                const scopedPackages = fs.readdirSync(scopedPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => path.join(scopedDir, dirent.name));
                packages.push(...scopedPackages);
            }

            for (const pkgName of packages) {
                const pkgPath = path.join(nodeModulesPath, pkgName);
                try {
                    const size = this.getDirectorySize(pkgPath);
                    packageStats.push({ name: pkgName, size });
                } catch (error) {
                    // Skip packages we can't read
                }
            }

            return packageStats.sort((a, b) => b.size - a.size);
        } catch (error) {
            console.error(`Error getting package sizes: ${error.message}`);
            return packageStats;
        }
    }

    /**
     * Get directory size recursively
     */
    getDirectorySize(dirPath) {
        let totalSize = 0;

        try {
            const items = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const item of items) {
                const itemPath = path.join(dirPath, item.name);

                if (item.isDirectory()) {
                    totalSize += this.getDirectorySize(itemPath);
                } else if (item.isFile()) {
                    const stats = fs.statSync(itemPath);
                    totalSize += stats.size;
                }
            }
        } catch (error) {
            // Skip items we can't read
        }

        return totalSize;
    }

    /**
     * Find duplicate dependencies
     */
    findDuplicateDependencies(packageStats) {
        const duplicates = [];
        const versionMap = new Map();

        for (const pkg of packageStats) {
            const baseName = pkg.name.split('@')[0].replace(/\/[^/]+$/, '');

            if (baseName.includes('/')) {
                // It's a scoped package, extract the actual name
                const parts = baseName.split('/');
                const scope = parts[0];
                const name = parts.slice(1).join('/');
                const fullName = `${scope}/${name}`;

                if (versionMap.has(fullName)) {
                    versionMap.get(fullName).push(pkg);
                } else {
                    versionMap.set(fullName, [pkg]);
                }
            }
        }

        for (const [name, versions] of versionMap) {
            if (versions.length > 1) {
                duplicates.push({
                    name,
                    versions: versions.map(v => ({
                        version: v.name.split('@').pop(),
                        size: this.formatBytes(v.size)
                    })),
                    totalSize: this.formatBytes(versions.reduce((sum, v) => sum + v.size, 0))
                });
            }
        }

        return duplicates;
    }

    /**
     * Generate dependency optimization suggestions
     */
    generateDependencyOptimizationSuggestions(analysis, packageStats) {
        const suggestions = [];

        // Large dependencies
        if (analysis.largeDependencies.length > 0) {
            suggestions.push({
                type: 'large_dependencies',
                priority: 'medium',
                message: `Found ${analysis.largeDependencies.length} large dependencies`,
                details: analysis.largeDependencies.map(dep => `${dep.name} (${dep.size})`),
                suggestion: 'Consider alternatives or use tree-shaking to reduce bundle size'
            });
        }

        // Duplicate dependencies
        if (analysis.duplicateDependencies.length > 0) {
            suggestions.push({
                type: 'duplicate_dependencies',
                priority: 'high',
                message: `Found ${analysis.duplicateDependencies.length} duplicate dependencies`,
                details: analysis.duplicateDependencies.map(dep => `${dep.name} (${dep.totalSize})`),
                suggestion: 'Use npm dedupe or update package.json to resolve version conflicts'
            });
        }

        // High dependency count
        if (analysis.dependencyCount > 500) {
            suggestions.push({
                type: 'dependency_count',
                priority: 'medium',
                message: `High number of dependencies: ${analysis.dependencyCount}`,
                suggestion: 'Audit dependencies and remove unused packages'
            });
        }

        // Bundle size optimization
        if (fs.existsSync('package.json')) {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            if (!packageJson.sideEffects && packageJson.type === 'module') {
                suggestions.push({
                    type: 'tree_shaking',
                    priority: 'low',
                    message: 'Consider adding "sideEffects": false to package.json',
                    suggestion: 'Enables better tree-shaking for smaller bundles'
                });
            }
        }

        return suggestions;
    }

    /**
     * Analyze Docker build performance
     */
    analyzeDockerPerformance() {
        console.log('🐳 Analyzing Docker build performance...');

        const analysis = {
            hasDockerfile: fs.existsSync('Dockerfile'),
            dockerfileSize: 0,
            layerCount: 0,
            optimizations: [],
            securityIssues: []
        };

        if (analysis.hasDockerfile) {
            try {
                const dockerfileContent = fs.readFileSync('Dockerfile', 'utf8');
                analysis.dockerfileSize = dockerfileContent.length;
                analysis.layerCount = dockerfileContent.split('\n').filter(line =>
                    line.trim().startsWith('RUN') ||
                    line.trim().startsWith('COPY') ||
                    line.trim().startsWith('ADD')
                ).length;

                // Check for Docker optimizations
                if (!dockerfileContent.includes('.dockerignore')) {
                    analysis.optimizations.push({
                        type: 'dockerignore',
                        priority: 'high',
                        message: 'Missing .dockerignore file',
                        suggestion: 'Add .dockerignore to reduce build context size'
                    });
                }

                if (!dockerfileContent.includes('multi-stage')) {
                    analysis.optimizations.push({
                        type: 'multi_stage',
                        priority: 'medium',
                        message: 'Consider using multi-stage builds',
                        suggestion: 'Reduces final image size by excluding build dependencies'
                    });
                }

                // Check for base image updates
                const fromMatch = dockerfileContent.match(/FROM\s+([^\s\n]+)/);
                if (fromMatch) {
                    const baseImage = fromMatch[1];
                    if (baseImage.includes('latest')) {
                        analysis.securityIssues.push({
                            type: 'latest_tag',
                            priority: 'high',
                            message: `Using 'latest' tag for base image: ${baseImage}`,
                            suggestion: 'Pin to specific version for reproducible builds'
                        });
                    }
                }

                // Check for root user usage
                if (!dockerfileContent.includes('USER') && !dockerfileContent.includes('RUN adduser')) {
                    analysis.securityIssues.push({
                        type: 'root_user',
                        priority: 'high',
                        message: 'Container runs as root user',
                        suggestion: 'Add non-root user for better security'
                    });
                }

                console.log(`   Dockerfile: ${analysis.hasDockerfile ? 'Found' : 'Not found'}`);
                console.log(`   Layers: ${analysis.layerCount}`);
                console.log(`   Optimizations: ${analysis.optimizations.length}`);

            } catch (error) {
                console.error(`❌ Error analyzing Dockerfile: ${error.message}`);
            }
        }

        return analysis;
    }

    /**
     * Analyze GitHub Actions workflow performance
     */
    analyzeWorkflowPerformance() {
        console.log('🔄 Analyzing GitHub Actions workflow performance...');

        const analysis = {
            workflowCount: 0,
            jobCount: 0,
            stepCount: 0,
            parallelJobs: 0,
            cacheHits: [],
            optimizations: []
        };

        const workflowsPath = '.github/workflows';

        if (fs.existsSync(workflowsPath)) {
            try {
                const workflowFiles = fs.readdirSync(workflowsPath)
                    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

                analysis.workflowCount = workflowFiles.length;

                for (const workflowFile of workflowFiles) {
                    const workflowPath = path.join(workflowsPath, workflowFile);
                    const workflowContent = fs.readFileSync(workflowPath, 'utf8');

                    // Count jobs and steps
                    const jobMatches = workflowContent.match(/^\s*[a-zA-Z0-9_-]+:\s*$/gm);
                    if (jobMatches) {
                        analysis.jobCount += jobMatches.length;
                    }

                    const stepMatches = workflowContent.match(/^\s*-\s+name:/gm);
                    if (stepMatches) {
                        analysis.stepCount += stepMatches.length;
                    }

                    // Check for parallel jobs
                    if (workflowContent.includes('strategy:') && workflowContent.includes('matrix:')) {
                        analysis.parallelJobs++;
                    }

                    // Check for caching
                    if (workflowContent.includes('actions/cache')) {
                        analysis.cacheHits.push(workflowFile);
                    }

                    // Analyze for optimizations
                    if (!workflowContent.includes('actions/cache') && workflowContent.includes('npm ci')) {
                        analysis.optimizations.push({
                            type: 'npm_cache',
                            priority: 'high',
                            message: `${workflowFile}: Missing npm cache`,
                            suggestion: 'Add npm cache action to speed up dependency installation'
                        });
                    }

                    if (workflowContent.includes('actions/checkout@v3') || workflowContent.includes('actions/checkout@v2')) {
                        analysis.optimizations.push({
                            type: 'checkout_version',
                            priority: 'low',
                            message: `${workflowFile}: Using older checkout action`,
                            suggestion: 'Update to actions/checkout@v4 for latest features and security'
                        });
                    }
                }

                console.log(`   Workflows: ${analysis.workflowCount}`);
                console.log(`   Jobs: ${analysis.jobCount}`);
                console.log(`   Steps: ${analysis.stepCount}`);
                console.log(`   Parallel workflows: ${analysis.parallelJobs}`);
                console.log(`   Cached workflows: ${analysis.cacheHits.length}`);

            } catch (error) {
                console.error(`❌ Error analyzing workflows: ${error.message}`);
            }
        }

        return analysis;
    }

    /**
     * Analyze application performance patterns
     */
    analyzeApplicationPerformance() {
        console.log('🚀 Analyzing application performance patterns...');

        const analysis = {
            patterns: [],
            optimizations: [],
            metrics: {}
        };

        // Analyze Node.js patterns
        if (fs.existsSync('src') || fs.existsSync('app') || fs.existsSync('lib')) {
            const patterns = this.analyzeCodePatterns();
            analysis.patterns = patterns.patterns;
            analysis.optimizations = patterns.optimizations;
        }

        // Check for performance monitoring
        if (!fs.existsSync('package.json')) {
            return analysis;
        }

        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Check for monitoring tools
        const monitoringTools = ['prometheus-client', 'newrelic', 'datadog', 'elastic-apm-node', 'winston', 'morgan'];
        const hasMonitoring = monitoringTools.some(tool => deps[tool]);

        if (!hasMonitoring) {
            analysis.optimizations.push({
                type: 'monitoring',
                priority: 'medium',
                message: 'No performance monitoring detected',
                suggestion: 'Add monitoring tools like winston for logging or prometheus-client for metrics'
            });
        }

        // Check for compression
        if (deps.express && !deps.compression && !deps['express-compress']) {
            analysis.optimizations.push({
                type: 'compression',
                priority: 'medium',
                message: 'Express app without compression middleware',
                suggestion: 'Add compression middleware to reduce response sizes'
            });
        }

        // Check for clustering
        if (deps.express && !deps.cluster && !deps['pm2']) {
            analysis.optimizations.push({
                type: 'clustering',
                priority: 'low',
                message: 'Single-instance Node.js app',
                suggestion: 'Consider using cluster or PM2 for multi-core utilization'
            });
        }

        return analysis;
    }

    /**
     * Analyze code patterns for performance
     */
    analyzeCodePatterns() {
        const patterns = [];
        const optimizations = [];
        const jsFiles = this.findJavaScriptFiles();

        for (const file of jsFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');

                // Check for synchronous operations
                if (content.includes('fs.readFileSync') || content.includes('fs.writeSync')) {
                    patterns.push({
                        type: 'sync_io',
                        file,
                        count: (content.match(/fs\.readFileSync|fs\.writeSync/g) || []).length
                    });
                }

                // Check for memory-intensive patterns
                if (content.includes('JSON.parse(') && content.includes('fs.readFileSync')) {
                    optimizations.push({
                        type: 'streaming_json',
                        priority: 'medium',
                        message: `${file}: Large JSON file parsing`,
                        suggestion: 'Use streaming JSON parser for large files'
                    });
                }

                // Check for database connection patterns
                if (content.includes('createConnection') && !content.includes('pool')) {
                    optimizations.push({
                        type: 'database_pool',
                        priority: 'high',
                        message: `${file}: Database connection without pooling`,
                        suggestion: 'Use connection pooling for better performance'
                    });
                }

                // Check for caching
                if (content.includes('database') || content.includes('api') && !content.includes('cache')) {
                    optimizations.push({
                        type: 'caching',
                        priority: 'medium',
                        message: `${file}: API/database calls without caching`,
                        suggestion: 'Add caching layer to reduce response times'
                    });
                }

            } catch (error) {
                // Skip files that can't be read
            }
        }

        return { patterns, optimizations };
    }

    /**
     * Find all JavaScript files in the project
     */
    findJavaScriptFiles(dir = this.projectRoot) {
        const files = [];

        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });

            for (const item of items) {
                const itemPath = path.join(dir, item.name);

                if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                    files.push(...this.findJavaScriptFiles(itemPath));
                } else if (item.isFile() && (item.name.endsWith('.js') || item.name.endsWith('.mjs'))) {
                    files.push(itemPath);
                }
            }
        } catch (error) {
            // Skip directories we can't read
        }

        return files;
    }

    /**
     * Format bytes to human readable format
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Generate performance report
     */
    generateReport() {
        console.log('📊 Generating performance report...');

        const report = {
            timestamp: new Date().toISOString(),
            project: path.basename(this.projectRoot),
            metrics: this.metrics,
            analysis: {
                dependencies: this.analyzeDependencies(),
                docker: this.analyzeDockerPerformance(),
                workflows: this.analyzeWorkflowPerformance(),
                application: this.analyzeApplicationPerformance()
            },
            recommendations: [],
            summary: {
                totalOptimizations: 0,
                highPriority: 0,
                mediumPriority: 0,
                lowPriority: 0
            }
        };

        // Collect all optimizations
        const allOptimizations = [
            ...report.analysis.dependencies.optimizationSuggestions,
            ...report.analysis.docker.optimizations,
            ...report.analysis.docker.securityIssues,
            ...report.analysis.workflows.optimizations,
            ...report.analysis.application.optimizations
        ];

        report.recommendations = allOptimizations.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        // Count priorities
        report.summary.totalOptimizations = allOptimizations.length;
        report.summary.highPriority = allOptimizations.filter(opt => opt.priority === 'high').length;
        report.summary.mediumPriority = allOptimizations.filter(opt => opt.priority === 'medium').length;
        report.summary.lowPriority = allOptimizations.filter(opt => opt.priority === 'low').length;

        return report;
    }

    /**
     * Execute performance optimization analysis
     */
    async execute() {
        console.log('🚀 Starting performance optimization analysis...');

        try {
            const report = this.generateReport();

            // Save report
            const reportPath = 'performance-optimization-report.json';
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

            // Generate markdown summary
            const markdownReport = this.generateMarkdownReport(report);
            fs.writeFileSync('performance-optimization-summary.md', markdownReport);

            console.log('✅ Performance optimization analysis completed');
            console.log(`📋 Report saved: ${reportPath}`);
            console.log(`📝 Summary saved: performance-optimization-summary.md`);
            console.log('');
            console.log('📊 Summary:');
            console.log(`   Total optimizations: ${report.summary.totalOptimizations}`);
            console.log(`   High priority: ${report.summary.highPriority}`);
            console.log(`   Medium priority: ${report.summary.mediumPriority}`);
            console.log(`   Low priority: ${report.summary.lowPriority}`);

            return report;

        } catch (error) {
            console.error(`❌ Performance optimization error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate markdown report
     */
    generateMarkdownReport(report) {
        return `
# Performance Optimization Report

**Project**: ${report.project}
**Generated**: ${report.timestamp}

## 📊 Summary

- **Total Optimizations Found**: ${report.summary.totalOptimizations}
- **High Priority**: ${report.summary.highPriority} ⚠️
- **Medium Priority**: ${report.summary.mediumPriority} 💡
- **Low Priority**: ${report.summary.lowPriority} 🔍

## 🔧 Recommendations

${report.recommendations.map((opt, index) => `
### ${index + 1}. ${opt.message} (${opt.priority.toUpperCase()})

**Suggestion**: ${opt.suggestion}

${opt.details ? `\n**Details**:\n${opt.details.map(detail => `- ${detail}`).join('\n')}` : ''}

`).join('')}

## 📈 Analysis Details

### Dependencies Analysis
- **Total Dependencies**: ${report.analysis.dependencies.dependencyCount}
- **Dev Dependencies**: ${report.analysis.dependencies.devDependencyCount}
- **Large Packages**: ${report.analysis.dependencies.largeDependencies.length}
- **Duplicate Dependencies**: ${report.analysis.dependencies.duplicateDependencies.length}

### Docker Analysis
- **Dockerfile Found**: ${report.analysis.docker.hasDockerfile ? '✅' : '❌'}
- **Layer Count**: ${report.analysis.docker.layerCount}
- **Optimizations**: ${report.analysis.docker.optimizations.length}

### Workflow Analysis
- **Workflows**: ${report.analysis.workflows.workflowCount}
- **Jobs**: ${report.analysis.workflows.jobCount}
- **Steps**: ${report.analysis.workflows.stepCount}
- **Parallel Jobs**: ${report.analysis.workflows.parallelJobs}

### Application Analysis
- **Code Patterns**: ${report.analysis.application.patterns.length}
- **Optimizations**: ${report.analysis.application.optimizations.length}

---

*Generated by Performance Optimization Script*
`;
    }
}

// Main execution
if (require.main === module) {
    const optimizer = new PerformanceOptimizer();

    optimizer.execute().then(report => {
        process.exit(report.summary.highPriority > 5 ? 1 : 0);
    }).catch(error => {
        console.error(`❌ Execution error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = PerformanceOptimizer;