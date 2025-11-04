# GitHub Actions Enterprise Security Scanning Pipeline Guide

## Overview

This guide provides comprehensive patterns and best practices for implementing enterprise-grade security scanning pipelines using GitHub Actions. The workflows and configurations included demonstrate production-ready CI/CD patterns with integrated security scanning, performance monitoring, and deployment strategies.

## Architecture

The pipeline consists of multiple interconnected workflows:

1. **Security Scanning Pipeline** (`security-scan.yml`) - Comprehensive security analysis
2. **CI Build and Deploy Pipeline** (`ci-build.yml`) - Build, test, and deployment orchestration
3. **Kubernetes Deployment Pipeline** (`k8s-deploy.yml`) - Container orchestration and deployment strategies
4. **Performance Optimization Pipeline** (`performance-optimization.yml`) - Performance testing and monitoring

## Key Features

### 🔍 Security Scanning Integration

#### Supported Security Tools
- **Gitleaks**: Secret detection and leak prevention
- **Semgrep**: Static Application Security Testing (SAST)
- **CodeQL**: Advanced static analysis
- **Trivy**: Container and dependency vulnerability scanning
- **Snyk**: Dependency vulnerability management
- **OWASP Dependency Check**: Security audit for dependencies
- **NPM Audit**: JavaScript/Node.js security auditing

#### Security Scanning Matrix Strategy
```yaml
strategy:
  fail-fast: false
  matrix:
    scanner: [gitleaks, semgrep, njsscan, codeql]
    max-parallel: 2
```

### ⚡ Performance Optimization

#### Caching Strategies
- **Dependency Caching**: NPM packages and build artifacts
- **Layer Caching**: Docker build layers for faster container builds
- **Tool Caching**: Security scanning tools and test dependencies

```yaml
- name: Advanced NPM Cache Strategy
  uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      node_modules/.cache
    key: ${{ runner.os }}-node-v${{ matrix.node-version }}-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-v${{ matrix.node-version }}-
      ${{ runner.os }}-node-
```

### 🚀 Parallel Job Execution

#### Matrix Strategies for Scalability
- **Multi-OS Testing**: Ubuntu, Windows, macOS
- **Multi-Version Testing**: Node.js 16, 18, 20
- **Parallel Security Scans**: Multiple tools running concurrently
- **Performance Test Matrix**: Load, stress, and spike testing

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [16, 18, 20]
  max-parallel: 3
```

### 🔐 Secret Management & OIDC Federation

#### Best Practices
- **Principle of Least Privilege**: Minimal required permissions
- **OIDC Federation**: Eliminate long-lived credentials
- **Secret Masking**: Automatic redaction of sensitive data
- **Environment-Specific Secrets**: Separate secrets per deployment environment

```yaml
# Configure AWS Credentials (OIDC)
- name: Configure AWS Credentials (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN_PROD }}
    aws-region: us-west-2
```

### 🛡️ Environment Protection Rules

#### Deployment Gates
- **Required Reviewers**: Manual approval for production deployments
- **Wait Timers**: Delay deployments for safety
- **Custom Protection Rules**: Integration with external security tools
- **Concurrent Deployment Prevention**: Avoid simultaneous deployments

```yaml
environment:
  name: production
  url: https://app.example.com
```

### 📦 Artifact Management & Retention

#### Artifact Strategy
- **Automatic Cleanup**: Configurable retention periods
- **Artifact Dependencies**: Chain workflows with artifact sharing
- **SBOM Generation**: Software Bill of Materials for security compliance
- **Performance Reports**: Historical performance tracking

```yaml
- name: Upload Security Artifacts
  uses: actions/upload-artifact@v4
  with:
    name: security-results
    path: |
      *.sarif
      *.json
    retention-days: 30
```

### 📢 Notification Integrations

#### Multi-Channel Notifications
- **Slack Integration**: Real-time deployment and security alerts
- **Microsoft Teams**: Enterprise communication platform
- **Email Notifications**: Critical security and deployment updates
- **GitHub Comments**: Automated PR comments with scan results

```yaml
- name: Slack Notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    channel: ${{ secrets.SLACK_SECURITY_CHANNEL }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### ☸️ Kubernetes Deployment Patterns

#### Deployment Strategies
- **Blue-Green Deployment**: Zero-downtime deployments
- **Rolling Updates**: Gradual deployment with health checks
- **Canary Deployments**: Gradual traffic shifting
- **Rollback Capabilities**: Automatic and manual rollback options

```yaml
- name: Blue-Green Deployment Logic
  run: |
    # Get current active deployment
    CURRENT_SERVICE=$(kubectl get service app-service -o jsonpath='{.spec.selector.version}')
    NEW_VERSION="green"
    if [ "$CURRENT_SERVICE" == "green" ]; then
      NEW_VERSION="blue"
    fi

    # Deploy new version and switch traffic
    kubectl apply -f deployment-${NEW_VERSION}.yaml
    kubectl patch service app-service -p '{"spec":{"selector":{"version":"'"$NEW_VERSION"'"}}}'
```

### 🌍 Multi-Environment Support

#### Environment Configuration
- **Environment Matrix**: Staging, production, development
- **Environment-Specific Variables**: Separate configurations per environment
- **Conditional Deployments**: Environment-based deployment logic
- **Environment Health Monitoring**: Post-deployment validation

```yaml
strategy:
  matrix:
    environment: [staging, production]
    include:
      - environment: staging
        url: https://staging.example.com
        kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}
      - environment: production
        url: https://app.example.com
        kubeconfig: ${{ secrets.KUBE_CONFIG_PROD }}
```

## Configuration Examples

### 1. Comprehensive Security Scanning

```yaml
name: 🔍 Comprehensive Security Scanning Pipeline

on:
  push:
    branches: [ main, develop, release/* ]
  pull_request:
    branches: [ main, develop ]
  schedule:
    - cron: '0 2 * * 1'  # Weekly scan

permissions:
  contents: read
  packages: write
  security-events: write
  actions: read
  pull-requests: write

jobs:
  security-scan-matrix:
    name: SAST Scanning
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        scanner: [gitleaks, semgrep, njsscan, codeql]
      max-parallel: 2

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Gitleaks Secret Scanning
        if: matrix.scanner == 'gitleaks'
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          config_path: .github/gitleaks.toml
          format: sarif
          output_file: gitleaks.sarif

      - name: Upload SARIF Files
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ matrix.scanner }}.sarif
          category: ${{ matrix.scanner }}
```

### 2. Container Build with Security

```yaml
container-build:
  name: Build and Push Container
  runs-on: ubuntu-latest
  needs: security-scan

  steps:
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Login to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Extract Container Metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ghcr.io/${{ github.repository }}
        tags: |
          type=ref,event=branch
          type=semver,pattern={{version}}
          type=sha,prefix={{branch}}-

    - name: Build and Push Container Image
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        platforms: linux/amd64,linux/arm64
        provenance: true
        sbom: true

    - name: Container Security Scan
      uses: aquasecurity/trivy-action@master
      with:
        image-ref: ghcr.io/${{ github.repository }}:${{ steps.meta.outputs.version }}
        format: sarif
        output: trivy-results.sarif
        exit-code: '0'
        ignore-unfixed: true
```

### 3. Performance Testing Integration

```yaml
performance-tests:
  name: Performance Testing
  runs-on: ubuntu-latest
  strategy:
    matrix:
      test-type: [load, stress, spike]
      include:
        - test-type: load
          duration: 10
          vus: 10
        - test-type: stress
          duration: 15
          vus: 50

  steps:
    - name: Checkout Repository
      uses: actions/checkout@v4

    - name: Setup Performance Testing Tools
      run: |
        npm install -g artillery k6

    - name: Execute Performance Test
      run: |
        artillery run load-test-config-${{ matrix.test-type }}.yml
        k6 run --duration ${{ matrix.duration }}m --vus ${{ matrix.vus }} performance-test.js

    - name: Performance Gate Check
      run: |
        # Define and check performance thresholds
        RESPONSE_TIME=$(jq -r '.aggregate.responseTimes.mean' results.json)
        if (( $(echo "$RESPONSE_TIME > 1000" | bc -l) )); then
          echo "❌ Response time exceeds threshold"
          exit 1
        fi
```

## Recommended Marketplace Actions

### Security Scanning
- **gitleaks/gitleaks-action@v2** - Secret detection
- **semgrep/semgrep-action@v1** - SAST scanning
- **github/codeql-action/init@v3** - Code analysis
- **aquasecurity/trivy-action@master** - Container scanning
- **snyk/actions/node@master** - Dependency scanning
- **anchore/scan-action@v3** - Container vulnerability scanning

### Build and Deploy
- **actions/setup-node@v4** - Node.js environment setup
- **docker/build-push-action@v5** - Container building and pushing
- **docker/setup-buildx-action@v3** - Docker Buildx setup
- **azure/setup-kubectl@v3** - Kubernetes CLI setup
- **aws-actions/configure-aws-credentials@v4** - AWS authentication with OIDC

### Performance and Testing
- **actions/cache@v4** - Dependency and artifact caching
- **actions/upload-artifact@v4** - Artifact upload and sharing
- **actions/download-artifact@v4** - Artifact download
- **8398a7/action-slack@v3** - Slack notifications

### Code Quality
- **actions/dependency-review-action@v4** - Dependency security review
- **github/super-linter@v4** - Code quality and linting
- **dawidd6/action-send-mail@v3** - Email notifications

## Security Best Practices

### 1. Action Pinning
Always pin actions to specific versions or commit SHAs:

```yaml
# Good: Pinned to version
- uses: actions/checkout@v4

# Better: Pinned to commit SHA
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
```

### 2. Permission Management
Use minimal required permissions:

```yaml
permissions:
  contents: read
  packages: write
  security-events: write
```

### 3. Secret Management
- Never store secrets in workflow files
- Use environment-specific secrets
- Enable secret scanning in repository settings
- Rotate secrets regularly

### 4. Input Validation
Validate all user inputs and external data:

```yaml
- name: Validate Input
  run: |
    if [[ ! "${{ github.event.inputs.environment }}" =~ ^(staging|production)$ ]]; then
      echo "Invalid environment"
      exit 1
    fi
```

## Performance Optimization Techniques

### 1. Caching Strategies
- Multi-level caching for dependencies
- Build layer caching for containers
- Tool caching for faster workflow runs

### 2. Parallel Execution
- Matrix strategies for concurrent testing
- Parallel security scanning
- Independent job execution

### 3. Resource Optimization
- Use appropriate runner sizes
- Optimize Dockerfile for faster builds
- Minimize artifact sizes

### 4. Conditional Execution
- Skip unnecessary jobs on documentation changes
- Use path filters for selective workflows
- Implement smart caching strategies

## Monitoring and Alerting

### 1. Health Checks
- Application health monitoring
- Infrastructure health checks
- Performance threshold monitoring

### 2. Alerting
- Slack integration for real-time alerts
- Email notifications for critical issues
- GitHub issues for tracking problems

### 3. Reporting
- Automated security reports
- Performance dashboards
- Deployment status tracking

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Check workflow permissions
   - Verify secret access
   - Ensure OIDC role configuration

2. **Cache Misses**
   - Verify cache keys
   - Check cache path configurations
   - Monitor cache hit rates

3. **Timeout Issues**
   - Optimize workflow performance
   - Increase timeout values where appropriate
   - Use larger runners for compute-intensive tasks

4. **Security Scan Failures**
   - Review scan configuration files
   - Check for false positives
   - Update scanning tool versions

### Debugging Tips

1. **Enable Debug Logging**
   ```yaml
   env:
     ACTIONS_STEP_DEBUG: true
     ACTIONS_RUNNER_DEBUG: true
   ```

2. **Use Artifact Uploads**
   ```yaml
   - name: Upload Debug Artifacts
     uses: actions/upload-artifact@v4
     if: failure()
     with:
       name: debug-logs
       path: logs/
   ```

3. **Add Workflow Status Checks**
   ```yaml
   - name: Workflow Status
     if: always()
     run: |
       echo "Job status: ${{ job.status }}"
       echo "Workflow status: ${{ github.workflow_status }}"
   ```

## Migration from GitLab CI/CD

This implementation is designed to migrate from the existing GitLab CI/CD configuration while maintaining feature parity and adding enhanced security capabilities.

### Key Migration Points
1. **Security Tools**: Gitleaks, Semgrep, Trivy - same tools, GitHub Actions integration
2. **Multi-Environment Support**: Staging and production environments with proper isolation
3. **Container Security**: Integrated scanning and SBOM generation
4. **Slack Notifications**: Enhanced with multi-channel support
5. **Kubernetes Deployments**: Blue-green, rolling, and canary strategies

### Enhanced Features
1. **OIDC Federation**: Eliminate long-lived credentials
2. **Advanced Caching**: Multi-level caching for performance
3. **Performance Monitoring**: Integrated performance testing and monitoring
4. **Security Policy Enforcement**: Automated security gates and policy checks
5. **Comprehensive Reporting**: HTML, Markdown, and JSON reports

## Conclusion

This GitHub Actions enterprise security scanning pipeline provides a comprehensive, production-ready solution for modern DevSecOps practices. The modular design allows for easy customization and extension while maintaining security best practices and performance optimization.

The implementation demonstrates advanced GitHub Actions features including matrix strategies, caching, OIDC federation, environment protection, and integrated security scanning, making it suitable for enterprise-grade deployments.

For questions or support, refer to the GitHub documentation and the provided workflow examples in this repository.