# 🔐 GitHub Secrets Configuration Guide

This guide explains how to configure the required GitHub repository secrets for the comprehensive security CI/CD pipeline.

## 📋 Required Secrets

### 🔍 Security Scanning Tools

| Secret Name | Description | Example Value |
|-------------|-------------|----------------|
| `GITLEAKS_LICENSE` | Gitleaks license key for enterprise features | `glpat-xxxxxxxxxxxxxxxxxxxx` |
| `SEMGREP_APP_TOKEN` | Semgrep API token for advanced rules | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `SNYK_TOKEN` | Snyk API token for dependency scanning | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### 🛡️ Vulnerability Management

| Secret Name | Description | Example Value |
|-------------|-------------|----------------|
| `DEFECTDOJO_URL` | DefectDojo instance URL | `defectdojo.example.com` |
| `DEFECTDOJO_API_KEY` | DefectDojo API key for report uploads | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `DEPENDENCY_TRACK_URL` | Dependency-Track instance URL | `dependency-track.example.com` |
| `DEPENDENCY_TRACK_API_KEY` | Dependency-Track API key | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### ☸️ Kubernetes Deployment

| Secret Name | Description | Example Value |
|-------------|-------------|----------------|
| `KUBE_CONFIG_BASE64` | Base64-encoded kubeconfig file | `YXBpVmVyc2lvbjogdjEKY2x1c3RlcnM6Ci0gY2x1c3RlcjoKICAgIGNlcnRpZmljYXRlLWF1dGhvcml0eS1kYXRhOiBUV1Mw...` |

### 📱 Notifications

| Secret Name | Description | Example Value |
|-------------|-------------|----------------|
| `SLACK_WEBHOOK` | Slack webhook URL for failure notifications | `https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK` |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams webhook URL | `https://outlook.office.com/webhook/YOUR/TEAMS/WEBHOOK` |

### 📧 Email Notifications (Optional)

| Secret Name | Description | Example Value |
|-------------|-------------|----------------|
| `EMAIL_USERNAME` | SMTP username for email notifications | `noreply@example.com` |
| `EMAIL_PASSWORD` | SMTP password for email notifications | `app_password_here` |
| `SECURITY_TEAM_EMAIL` | Security team email address | `security-team@example.com` |

## 🔧 Configuration Steps

### 1. Navigate to Repository Settings

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

### 2. Add Security Scanning Secrets

#### Gitleaks License (Optional but Recommended)
```bash
# Get your Gitleaks license from https://gitleaks.io/
# Add as secret: GITLEAKS_LICENSE
# Value: glpat-your-license-key
```

#### Semgrep App Token
```bash
# Get token from https://semgrep.dev/
# Add as secret: SEMGREP_APP_TOKEN
# Value: your-semgrep-token
```

#### Snyk Token (Optional)
```bash
# Get token from https://snyk.io/
# Add as secret: SNYK_TOKEN
# Value: your-snyk-token
```

### 3. Add Vulnerability Management Secrets

#### DefectDojo Configuration
```bash
# Add as secret: DEFECTDOJO_URL
# Value: defectdojo.yourdomain.com (without http:// or https://)

# Add as secret: DEFECTDOJO_API_KEY
# Value: your-defectdojo-api-key
```

#### Dependency-Track Configuration
```bash
# Add as secret: DEPENDENCY_TRACK_URL
# Value: dependency-track.yourdomain.com (without http:// or https://)

# Add as secret: DEPENDENCY_TRACK_API_KEY
# Value: your-dependency-track-api-key
```

### 4. Configure Kubernetes Deployment

#### Create kubeconfig
```bash
# Get your kubeconfig file
# Usually located at ~/.kube/config

# Encode to base64 (macOS/Linux):
base64 -i ~/.kube/config

# Encode to base64 (Windows):
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content ~/.kube/config -Raw)))

# Add as secret: KUBE_CONFIG_BASE64
# Value: [base64-encoded-kubeconfig]
```

### 5. Configure Notification Systems

#### Slack Webhook
```bash
# Create Slack app and get webhook URL
# https://api.slack.com/messaging/webhooks

# Add as secret: SLACK_WEBHOOK
# Value: https://hooks.slack.com/services/...
```

#### Teams Webhook (Optional)
```bash
# Create Teams incoming webhook
# https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook

# Add as secret: TEAMS_WEBHOOK_URL
# Value: https://outlook.office.com/webhook/...
```

## 🔒 Security Best Practices

### 1. Principle of Least Privilege
- Use API keys with minimal required permissions
- Rotate secrets regularly
- Use different keys for different environments

### 2. Secret Management
- Never commit secrets to version control
- Use different secrets for development and production
- Monitor secret usage and access logs

### 3. Environment-Specific Secrets
Consider using **Environment secrets** for different deployment environments:

```yaml
# Production environment secrets
- PRODUCTION_KUBE_CONFIG_BASE64
- PRODUCTION_SLACK_WEBHOOK

# Development environment secrets
- DEV_KUBE_CONFIG_BASE64
- DEV_SLACK_WEBHOOK
```

### 4. OIDC Federation (Recommended)
For cloud providers, use OIDC instead of static credentials:

```yaml
# Example for AWS
- AWS_ROLE_ARN: arn:aws:iam::123456789012:role/github-actions-role
- AWS_REGION: us-west-2
```

## 🧪 Testing Configuration

### 1. Validate Secret Access
Create a test workflow to verify secret access:

```yaml
name: Test Secrets
on:
  workflow_dispatch:
jobs:
  test-secrets:
    runs-on: ubuntu-latest
    steps:
      - name: Test Secret Access
        run: |
          if [ -n "${{ secrets.DEFECTDOJO_URL }}" ]; then
            echo "✅ DefectDojo URL is configured"
          else
            echo "❌ DefectDojo URL is missing"
          fi
```

### 2. Test API Connectivity
Test API endpoints with your configured secrets:

```bash
# Test DefectDojo API
curl -H "Authorization: Token ${{ secrets.DEFECTDOJO_API_KEY }}" \
     "${{ secrets.DEFECTDOJO_URL }}/api/v2/products/"
```

## 🔄 Secret Rotation

### Regular Maintenance
- Set calendar reminders for secret rotation
- Update API keys every 90 days
- Review and remove unused secrets

### Automation
Consider using secret management tools:
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault

## 📋 Configuration Checklist

- [ ] Gitleaks license configured (optional)
- [ ] Semgrep API token configured
- [ ] DefectDojo URL and API key configured
- [ ] Dependency-Track URL and API key configured
- [ ] Kubernetes kubeconfig encoded and added
- [ ] Slack webhook URL configured
- [ ] Email notifications configured (optional)
- [ ] Environment-specific secrets created
- [ ] Secret access tested
- [ ] API connectivity verified

## 🚀 Next Steps

1. **Configure all required secrets** using this guide
2. **Test the pipeline** by pushing to a development branch
3. **Monitor first run** to ensure all integrations work
4. **Review logs** for any authentication issues
5. **Fine-tune configurations** based on your specific needs

For more information on GitHub Actions secrets, see the [GitHub documentation](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).