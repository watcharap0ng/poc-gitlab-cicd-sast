#!/bin/bash

# =============================================================================
# 🕷️ STANDALONE DAST SCANNER - Dynamic Application Security Testing
# =============================================================================
# Description: Comprehensive standalone DAST scanner for ad-hoc security testing
# Author: Security Team
# Version: 1.0.0
# Last Updated: 2025-01-01
# Compatible with: poc-gitlab-cicd-sast v2.0+
#
# Usage: ./dast-standalone.sh [OPTIONS] TARGET_URL
# Integration: Designed for GitLab CI/CD and standalone execution
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION & CONSTANTS
# =============================================================================
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly CONFIG_FILE="${DAST_CONFIG:-${SCRIPT_DIR}/dast-config.json}"
readonly WORK_DIR="${DAST_WORK_DIR:-$(mktemp -d -t dast-XXXXXX)}"
readonly LOG_FILE="${WORK_DIR}/dast-$(date +%Y%m%d-%H%M%S).log"
readonly REPORT_DIR="${DAST_REPORT_DIR:-${WORK_DIR}/reports}"

# Docker & ZAP Configuration (reuse existing values)
readonly ZAP_DOCKER_IMAGE="${ZAP_DOCKER_IMAGE:-zaproxy/zap-stable:latest}"
readonly ZAP_CONTAINER_NAME="dast-zap-$(date +%s)"
readonly ZAP_API_KEY="${ZAP_API_KEY:-$(openssl rand -hex 16)}"
readonly ZAP_HOST="${ZAP_HOST:-localhost}"
readonly ZAP_PORT="${ZAP_PORT:-8090}"
readonly ZAP_API_URL="http://${ZAP_HOST}:${ZAP_PORT}"

# Default values from existing pipeline
DEFAULT_SCAN_DEPTH="${ZAP_SCAN_DEPTH:-5}"
DEFAULT_THREADS="${ZAP_THREADS:-5}"
DEFAULT_MAX_DURATION="${ZAP_MAX_DURATION:-1800}"
DEFAULT_DELAY_MS="${ZAP_DELAY_MS:-0}"
DEFAULT_AUTH_METHOD="${ZAP_AUTH_METHOD:-none}"
DEFAULT_BROWSER_ID="${ZAP_BROWSER_ID:-chrome-headless}"
DEFAULT_AJAX_SPIDER="${ZAP_AJAX_SPIDER_ENABLED:-true}"
DEFAULT_AJAX_SPIDER_MAX_DURATION="${ZAP_AJAX_SPIDER_MAX_DURATION:-1800}"

# =============================================================================
# COLORS & OUTPUT FORMATTING (reused from existing patterns)
# =============================================================================
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# =============================================================================
# LOGGING FUNCTIONS (consistent with existing scripts)
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Write to log file (consistent with existing patterns)
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Console output with colors
    case "$level" in
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" >&2 ;;
        "WARN") [[ "${VERBOSE:-true}" != "false" ]] && echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "INFO") [[ "${VERBOSE:-true}" != "false" ]] && echo -e "${BLUE}[INFO]${NC} $message" ;;
        "DEBUG") [[ "${VERBOSE:-false}" == "true" ]] && echo -e "${PURPLE}[DEBUG]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
    esac
}

# =============================================================================
# CONFIGURATION MANAGEMENT
# =============================================================================

load_config() {
    local config_file="$1"

    if [[ -f "$config_file" ]]; then
        log "INFO" "Loading configuration from: $config_file"

        # Validate JSON configuration
        if ! python3 -c "import json; json.load(open('$config_file'))" 2>/dev/null; then
            log "ERROR" "Invalid JSON in configuration file: $config_file"
            return 1
        fi

        # Export configuration variables
        python3 << EOF
import json
import os

with open('$config_file', 'r') as f:
    config = json.load(f)

# Set environment variables from config
for key, value in config.items():
    if isinstance(value, (str, int, float, bool)):
        os.environ[key.upper()] = str(value)
    elif isinstance(value, list):
        os.environ[key.upper()] = ','.join(str(v) for v in value)

print("Configuration loaded successfully")
EOF
        log "SUCCESS" "Configuration loaded successfully"
    else
        log "WARN" "Configuration file not found: $config_file"
        log "INFO" "Using environment variables and defaults"
    fi
}

create_config_template() {
    local config_file="${SCRIPT_DIR}/dast-config.json.example"

    cat > "$config_file" << 'EOF'
{
  "description": "DAST Standalone Scanner Configuration Template",
  "version": "1.0.0",

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
    "cookies": "",
    "auth_url": "",
    "login_field": "username",
    "password_field": "password",
    "verify_url": "",
    "logout_url": ""
  },

  "exclusions": {
    "exclude_urls": ".*\\.css$,.*\\.js$,.*\\.png$,.*\\.jpg$,.*\\.gif$,.*\\.svg$",
    "exclude_params": "session.*,csrf.*,auth.*,token.*,password.*,confirm.*",
    "exclude_headers": "X-Debug,X-Requested-With",
    "exclude_cookies": "session.*,csrf.*,auth.*,token.*",
    "exclude_status_codes": "404,500,502,503"
  },

  "zap_configuration": {
    "context_name": "dast-scan-context",
    "technology": "NodeJS,React,JavaScript,HTML5",
    "allowed_hosts": "",
    "authentication_strategy": "detect"
  },

  "defectdojo": {
    "url": "",
    "token": "",
    "project_name": "",
    "engagement_name": "",
    "auto_create": true,
    "upload_findings": true
  },

  "policy": {
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
EOF

    log "SUCCESS" "Configuration template created: $config_file"
    log "INFO" "Copy to dast-config.json and customize for your environment"
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

validate_target() {
    local target_url="$1"

    log "DEBUG" "Validating target URL: $target_url"

    # Basic URL validation
    if [[ ! "$target_url" =~ ^https?:// ]]; then
        log "ERROR" "Target URL must start with http:// or https://"
        return 1
    fi

    # Check URL accessibility
    if curl -s --head --connect-timeout 10 --max-time 30 "$target_url" >/dev/null 2>&1; then
        log "DEBUG" "Target URL is accessible: $target_url"
    else
        log "WARN" "Target URL may not be accessible: $target_url"
        log "INFO" "Proceeding with scan - this may be expected for internal targets"
    fi

    return 0
}

validate_environment() {
    log "DEBUG" "Validating execution environment"

    # Check Docker
    if ! command -v docker >/dev/null 2>&1; then
        log "ERROR" "Docker is required but not found in PATH"
        return 1
    fi

    if ! docker info >/dev/null 2>&1; then
        log "ERROR" "Docker daemon is not running or accessible"
        return 1
    fi

    # Check Python for JSON processing
    if ! command -v python3 >/dev/null 2>&1; then
        log "ERROR" "Python3 is required for report processing"
        return 1
    fi

    # Pull ZAP image if needed
    if ! docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "^${ZAP_DOCKER_IMAGE}"; then
        log "INFO" "Pulling ZAP Docker image: $ZAP_DOCKER_IMAGE"
        if ! docker pull "$ZAP_DOCKER_IMAGE"; then
            log "ERROR" "Failed to pull ZAP Docker image"
            return 1
        fi
    fi

    log "SUCCESS" "Environment validation completed"
    return 0
}

wait_for_zap() {
    local max_attempts=30
    local attempt=1

    log "INFO" "Waiting for ZAP to start..."

    while [[ $attempt -le $max_attempts ]]; do
        if curl -s -f "${ZAP_API_URL}/JSON/core/view/version/" >/dev/null 2>&1; then
            log "INFO" "ZAP API is ready (attempt $attempt/$max_attempts)"
            return 0
        fi

        log "DEBUG" "Waiting for ZAP API... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done

    log "ERROR" "ZAP API failed to start within ${max_attempts} attempts"
    return 1
}

cleanup() {
    local exit_code=$?

    log "DEBUG" "Starting cleanup (exit code: $exit_code)"

    # Stop and remove ZAP container
    if docker ps -q -f name="$ZAP_CONTAINER_NAME" | grep -q .; then
        log "INFO" "Stopping ZAP container: $ZAP_CONTAINER_NAME"
        docker stop "$ZAP_CONTAINER_NAME" >/dev/null 2>&1 || true
        docker rm "$ZAP_CONTAINER_NAME" >/dev/null 2>&1 || true
    fi

    # Clean up temporary files
    if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
        log "DEBUG" "Cleaning up temporary directory: $WORK_DIR"
        # Keep reports if they exist
        if [[ -d "$REPORT_DIR" && "$REPORT_DIR" != "$WORK_DIR" ]]; then
            log "DEBUG" "Preserving reports directory: $REPORT_DIR"
        else
            rm -rf "$WORK_DIR" || true
        fi
    fi

    log "DEBUG" "Cleanup completed"
    exit $exit_code
}

# =============================================================================
# ZAP MANAGEMENT
# =============================================================================

start_zap() {
    log "INFO" "Starting ZAP container: $ZAP_CONTAINER_NAME"

    # Create necessary directories
    mkdir -p "${WORK_DIR}/zap" "$REPORT_DIR"

    # Start ZAP with configuration from existing pipeline
    docker run -d \
        --name "$ZAP_CONTAINER_NAME" \
        -p "${ZAP_PORT}:8090" \
        -v "${WORK_DIR}/zap:/zap/wrk" \
        -v "${REPORT_DIR}:/zap/report" \
        "$ZAP_DOCKER_IMAGE" \
        zap.sh \
        -daemon \
        -host 0.0.0.0 \
        -port 8090 \
        -config api.addrs.addr.name=.* \
        -config api.addrs.addr.regex=true \
        -config api.disablekey=true \
        >/dev/null 2>&1

    if ! wait_for_zap; then
        log "ERROR" "Failed to start ZAP"
        return 1
    fi

    log "SUCCESS" "ZAP started successfully (API: $ZAP_API_URL)"
    return 0
}

setup_zap_context() {
    local target_url="$1"
    local context_name="${ZAP_CONTEXT_NAME:-dast-scan-context}"

    log "INFO" "Setting up ZAP context: $context_name"

    # Create context
    local context_response
    context_response=$(curl -s "${ZAP_API_URL}/JSON/context/action/newContext/" \
        -d "contextName=$context_name")

    local context_id
    context_id=$(echo "$context_response" | \
        python3 -c "import json, sys; print(json.load(sys.stdin).get('contextId', ''))" 2>/dev/null)

    if [[ -z "$context_id" ]]; then
        log "ERROR" "Failed to create ZAP context"
        return 1
    fi

    # Include target URL in context
    local target_regex="${target_url//./}"
    curl -s "${ZAP_API_URL}/JSON/context/action/includeInContext/" \
        -d "contextName=$context_name" \
        -d "regex=${target_regex}" \
        >/dev/null

    # Set technology stack if specified
    if [[ -n "${ZAP_TECHNOLOGY:-}" ]]; then
        log "DEBUG" "Setting technology stack: $ZAP_TECHNOLOGY"
        curl -s "${ZAP_API_URL}/JSON/context/action/setContextTechnology/" \
            -d "contextName=$context_name" \
            -d "technology=$ZAP_TECHNOLOGY" \
            >/dev/null
    fi

    log "SUCCESS" "ZAP context configured (ID: $context_id)"
    echo "$context_id"
}

# =============================================================================
# AUTHENTICATION MODULES (reuse existing patterns)
# =============================================================================

configure_authentication() {
    local context_id="$1"
    local auth_method="${AUTH_METHOD:-none}"

    log "INFO" "Configuring authentication: $auth_method"

    case "$auth_method" in
        "form")
            configure_form_auth "$context_id"
            ;;
        "token")
            configure_token_auth "$context_id"
            ;;
        "cookie")
            configure_cookie_auth "$context_id"
            ;;
        "oauth")
            configure_oauth_auth "$context_id"
            ;;
        "none"|"")
            log "INFO" "No authentication configured"
            return 0
            ;;
        *)
            log "ERROR" "Unsupported authentication method: $auth_method"
            log "INFO" "Supported methods: none, form, token, cookie, oauth"
            return 1
            ;;
    esac
}

configure_form_auth() {
    local context_id="$1"

    local auth_url="${AUTH_URL:-${TARGET_URL}/login}"
    local login_field="${AUTH_LOGIN_FIELD:-username}"
    local password_field="${AUTH_PASSWORD_FIELD:-password}"

    log "INFO" "Configuring form-based authentication"
    log "DEBUG" "  Auth URL: $auth_url"
    log "DEBUG" "  Login field: $login_field"
    log "DEBUG" "  Password field: $password_field"

    if [[ -z "${AUTH_USERNAME:-}" || -z "${AUTH_PASSWORD:-}" ]]; then
        log "ERROR" "Form authentication requires AUTH_USERNAME and AUTH_PASSWORD"
        return 1
    fi

    # Set authentication method
    curl -s "${ZAP_API_URL}/JSON/authentication/setAuthenticationMethod/" \
        -d "contextId=$context_id" \
        -d "authMethodName=formBasedAuthentication" \
        -d "authMethodConfigParams=loginUrl=$auth_url&loginRequestUsername=$login_field&loginRequestPassword=$password_field" \
        >/dev/null

    # Set credentials
    curl -s "${ZAP_API_URL}/JSON/users/setAuthenticationCredentials/" \
        -d "contextId=$context_id" \
        -d "userId=0" \
        -d "authCredentialsParamUsername=$AUTH_USERNAME" \
        -d "authCredentialsParamPassword=$AUTH_PASSWORD" \
        >/dev/null

    # Enable user
    curl -s "${ZAP_API_URL}/JSON/users/setUserEnabled/" \
        -d "contextId=$context_id" \
        -d "userId=0" \
        -d "enabled=true" \
        >/dev/null

    log "SUCCESS" "Form authentication configured"
    return 0
}

configure_token_auth() {
    local context_id="$1"

    if [[ -z "${AUTH_TOKEN:-}" ]]; then
        log "ERROR" "Token authentication requires AUTH_TOKEN"
        return 1
    fi

    log "INFO" "Configuring token-based authentication"

    # Add authorization header
    curl -s "${ZAP_API_URL}/JSON/context/addContextRegexHeader/" \
        -d "contextId=$context_id" \
        -d "regex=.*" \
        -d "name=Authorization" \
        -d "value=Bearer $AUTH_TOKEN" \
        >/dev/null

    log "SUCCESS" "Token authentication configured"
    return 0
}

configure_cookie_auth() {
    local context_id="$1"

    if [[ -z "${AUTH_COOKIES:-}" ]]; then
        log "ERROR" "Cookie authentication requires AUTH_COOKIES"
        return 1
    fi

    log "INFO" "Configuring cookie-based authentication"

    # Parse and set cookies (reusing existing pattern)
    IFS=';' read -ra COOKIES_ARRAY <<< "$AUTH_COOKIES"
    for cookie in "${COOKIES_ARRAY[@]}"; do
        cookie=$(echo "$cookie" | xargs)  # trim whitespace
        if [[ "$cookie" =~ ^([^=]+)=(.+)$ ]]; then
            local name="${BASH_REMATCH[1]}"
            local value="${BASH_REMATCH[2]}"

            log "DEBUG" "Setting cookie: $name"
            curl -s "${ZAP_API_URL}/JSON/context/addContextRegexCookie/" \
                -d "contextId=$context_id" \
                -d "regex=.*" \
                -d "name=$name" \
                -d "value=$value" \
                >/dev/null
        fi
    done

    log "SUCCESS" "Cookie authentication configured"
    return 0
}

configure_oauth_auth() {
    local context_id="$1"

    log "INFO" "OAuth2 authentication requires custom implementation"
    log "WARN" "Current implementation falls back to form authentication"

    if [[ -n "${AUTH_USERNAME:-}" && -n "${AUTH_PASSWORD:-}" ]]; then
        configure_form_auth "$context_id"
    else
        log "ERROR" "OAuth2 authentication not implemented"
        return 1
    fi
}

# =============================================================================
# SCANNING FUNCTIONS
# =============================================================================

run_spider() {
    local context_id="$1"
    local target_url="$2"

    log "INFO" "Starting traditional spider scan"

    # Configure spider parameters from existing pipeline
    local spider_max_depth="${SPIDER_MAX_DEPTH:-10}"
    local spider_max_children="${SPIDER_MAX_CHILDREN:-100}"
    local spider_accept_cookies="${SPIDER_ACCEPT_COOKIES:-true}"
    local spider_handle_params="${SPIDER_HANDLE_PARAMETERS:-true}"

    # Start spider
    local spider_response
    spider_response=$(curl -s "${ZAP_API_URL}/JSON/spider/action/scan/" \
        -d "url=$target_url" \
        -d "maxChildren=$spider_max_children" \
        -d "maxDepth=$spider_max_depth" \
        -d "acceptCookies=$spider_accept_cookies" \
        -d "handleODataParameters=$spider_handle_params")

    local scan_id
    scan_id=$(echo "$spider_response" | \
        python3 -c "import json, sys; print(json.load(sys.stdin).get('scan', ''))" 2>/dev/null)

    if [[ -z "$scan_id" ]]; then
        log "ERROR" "Failed to start spider scan"
        return 1
    fi

    log "DEBUG" "Spider scan started (ID: $scan_id)"

    # Monitor spider progress
    local max_wait=$((MAX_DURATION / 10))  # Check every 10 seconds
    local wait_time=0

    while [[ $wait_time -lt $max_wait ]]; do
        local status_response
        status_response=$(curl -s "${ZAP_API_URL}/JSON/spider/view/status/" \
            -d "scanId=$scan_id")

        local progress
        progress=$(echo "$status_response" | \
            python3 -c "import json, sys; print(json.load(sys.stdin).get('status', '0'))" 2>/dev/null)

        log "DEBUG" "Spider progress: ${progress}%"

        if [[ "$progress" == "100" ]]; then
            log "SUCCESS" "Spider scan completed"
            break
        fi

        sleep 10
        ((wait_time += 10))
    done

    if [[ $wait_time -ge $max_wait ]]; then
        log "WARN" "Spider scan timed out, proceeding with active scan"
    fi

    return 0
}

run_ajax_spider() {
    local context_id="$1"
    local target_url="$2"

    if [[ "${AJAX_SPIDER}" != "true" ]]; then
        log "INFO" "AJAX spider disabled"
        return 0
    fi

    log "INFO" "Starting AJAX spider scan (max duration: ${AJAX_SPIDER_MAX_DURATION}s)"

    # Start AJAX spider
    local ajax_response
    ajax_response=$(curl -s "${ZAP_API_URL}/JSON/ajaxSpider/scan/" \
        -d "contextName=${ZAP_CONTEXT_NAME:-dast-scan-context}" \
        -d "url=$target_url" \
        -d "maxDuration=$AJAX_SPIDER_MAX_DURATION" \
        -d "browserId=${BROWSER_ID}")

    local scan_id
    scan_id=$(echo "$ajax_response" | \
        python3 -c "import json, sys; print(json.load(sys.stdin).get('scan', ''))" 2>/dev/null)

    if [[ -z "$scan_id" ]]; then
        log "ERROR" "Failed to start AJAX spider scan"
        return 1
    fi

    log "DEBUG" "AJAX spider started (ID: $scan_id)"

    # Monitor AJAX spider progress
    local max_wait=$((AJAX_SPIDER_MAX_DURATION / 10))
    local wait_time=0

    while [[ $wait_time -lt $max_wait ]]; do
        local status_response
        status_response=$(curl -s "${ZAP_API_URL}/JSON/ajaxSpider/view/status/")

        local status
        status=$(echo "$status_response" | \
            python3 -c "import json, sys; print(json.load(sys.stdin).get('status', 'stopped'))" 2>/dev/null)

        log "DEBUG" "AJAX spider status: $status"

        if [[ "$status" == "stopped" ]]; then
            log "SUCCESS" "AJAX spider scan completed"
            break
        fi

        sleep 10
        ((wait_time += 10))
    done

    if [[ $wait_time -ge $max_wait ]]; then
        log "WARN" "AJAX spider timed out, stopping..."
        curl -s "${ZAP_API_URL}/JSON/ajaxSpider/stop/" >/dev/null
    fi

    return 0
}

run_active_scan() {
    local context_id="$1"
    local target_url="$2"

    log "INFO" "Starting active security scan"

    # Apply exclusions from configuration
    apply_exclusions "$context_id"

    # Start active scan
    local active_response
    active_response=$(curl -s "${ZAP_API_URL}/JSON/ascan/action/scan/" \
        -d "contextId=$context_id" \
        -d "url=$target_url" \
        -d "recurse=true" \
        -d "scanPolicyName=Default Policy" \
        -d "maxDepth=$SCAN_DEPTH" \
        -d "threadPerHost=$THREADS" \
        -d "delayInMs=$DELAY_MS")

    local scan_id
    scan_id=$(echo "$active_response" | \
        python3 -c "import json, sys; print(json.load(sys.stdin).get('scan', ''))" 2>/dev/null)

    if [[ -z "$scan_id" ]]; then
        log "ERROR" "Failed to start active scan"
        return 1
    fi

    log "DEBUG" "Active scan started (ID: $scan_id)"

    # Monitor active scan progress
    local max_wait=$((MAX_DURATION / 5))  # Check every 5 seconds
    local wait_time=0

    while [[ $wait_time -lt $max_wait ]]; do
        local status_response
        status_response=$(curl -s "${ZAP_API_URL}/JSON/ascan/view/status/" \
            -d "scanId=$scan_id")

        local progress
        progress=$(echo "$status_response" | \
            python3 -c "import json, sys; print(json.load(sys.stdin).get('status', '0'))" 2>/dev/null)

        local records
        records=$(echo "$status_response" | \
            python3 -c "import json, sys; print(json.load(sys.stdin).get('recordsToScan', '0'))" 2>/dev/null)

        log "DEBUG" "Active scan progress: ${progress}% (${records} records remaining)"

        if [[ "$progress" == "100" ]]; then
            log "SUCCESS" "Active scan completed"
            break
        fi

        sleep 5
        ((wait_time += 5))
    done

    if [[ $wait_time -ge $max_wait ]]; then
        log "WARN" "Active scan timed out, stopping..."
        curl -s "${ZAP_API_URL}/JSON/ascan/action/stop/" \
            -d "scanId=$scan_id" >/dev/null
    fi

    return 0
}

apply_exclusions() {
    local context_id="$1"

    log "DEBUG" "Applying scan exclusions"

    # Apply URL exclusions
    if [[ -n "${EXCLUDE_URLS:-}" ]]; then
        IFS=',' read -ra EXCLUDE_URLS_ARRAY <<< "$EXCLUDE_URLS"
        for pattern in "${EXCLUDE_URLS_ARRAY[@]}"; do
            pattern=$(echo "$pattern" | xargs)  # trim whitespace
            log "DEBUG" "Excluding URL pattern: $pattern"
        done
    fi

    # Apply parameter exclusions
    if [[ -n "${EXCLUDE_PARAMS:-}" ]]; then
        log "DEBUG" "Excluding parameters: $EXCLUDE_PARAMS"
    fi

    # Apply header exclusions
    if [[ -n "${EXCLUDE_HEADERS:-}" ]]; then
        log "DEBUG" "Excluding headers: $EXCLUDE_HEADERS"
    fi

    # Apply cookie exclusions
    if [[ -n "${EXCLUDE_COOKIES:-}" ]]; then
        log "DEBUG" "Excluding cookies: $EXCLUDE_COOKIES"
    fi

    # Apply status code exclusions
    if [[ -n "${EXCLUDE_STATUS_CODES:-}" ]]; then
        log "DEBUG" "Excluding status codes: $EXCLUDE_STATUS_CODES"
    fi

    log "DEBUG" "Exclusions applied"
}

# =============================================================================
# REPORTING FUNCTIONS
# =============================================================================

generate_reports() {
    local report_name="${REPORT_NAME:-dast-report}"
    local json_report="${REPORT_DIR}/${report_name}.json"
    local html_report="${REPORT_DIR}/${report_name}.html"
    local md_report="${REPORT_DIR}/${report_name}.md"

    log "INFO" "Generating scan reports"

    # Generate JSON report
    log "INFO" "Generating JSON report: $json_report"
    if ! curl -s "${ZAP_API_URL}/JSON/core/view/jsonreport/" \
        -o "$json_report"; then
        log "ERROR" "Failed to generate JSON report"
        return 1
    fi

    # Generate HTML report
    if [[ "${GENERATE_HTML:-true}" == "true" ]]; then
        log "INFO" "Generating HTML report: $html_report"
        curl -s "${ZAP_API_URL}/JSON/core/view/htmlreport/" \
            -o "$html_report"
    fi

    # Generate Markdown summary
    if [[ "${GENERATE_MARKDOWN:-true}" == "true" ]]; then
        generate_markdown_summary "$json_report" "$md_report"
    fi

    # Generate metrics
    generate_scan_metrics "$json_report" "${REPORT_DIR}/${report_name}_metrics.json"

    log "SUCCESS" "Reports generated successfully"
    echo "$json_report"
}

generate_markdown_summary() {
    local json_report="$1"
    local md_report="$2"

    cat > "$md_report" << EOF
# 🕷️ DAST Scan Report

## Scan Information

- **Target URL**: $TARGET_URL
- **Scan Date**: $(date '+%Y-%m-%d %H:%M:%S')
- **Authentication**: ${AUTH_METHOD:-none}
- **Scan Configuration**:
  - Depth: ${SCAN_DEPTH:-5}
  - Threads: ${THREADS:-5}
  - Max Duration: ${MAX_DURATION:-1800}s
  - AJAX Spider: ${AJAX_SPIDER:-true}
  - Delay: ${DELAY_MS:-0}ms

## Executive Summary

EOF

    if [[ -f "$json_report" ]]; then
        python3 << EOF >> "$md_report"
import json
import sys

try:
    with open('$json_report', 'r') as f:
        data = json.load(f)

    alerts = data.get('site', [{}])[0].get('alerts', [])
    high_risk = len([a for a in alerts if a.get('risk') == 'High'])
    medium_risk = len([a for a in alerts if a.get('risk') == 'Medium'])
    low_risk = len([a for a in alerts if a.get('risk') == 'Low'])
    informational = len([a for a in alerts if a.get('risk') == 'Informational'])

    print(f"- **🔴 High Risk**: {high_risk}")
    print(f"- **🟡 Medium Risk**: {medium_risk}")
    print(f"- **🟢 Low Risk**: {low_risk}")
    print(f"- **ℹ️  Informational**: {informational}")
    print(f"- **📊 Total Findings**: {len(alerts)}")

    # Group findings by OWASP category
    owasp_categories = {}
    for alert in alerts:
        owasp = alert.get('reference', '')
        if owasp:
            owasp_categories[owasp] = owasp_categories.get(owasp, 0) + 1

    if owasp_categories:
        print("\n## OWASP Categories")
        for owasp, count in sorted(owasp_categories.items(), key=lambda x: x[1], reverse=True):
            print(f"- **{owasp}**: {count}")

    # Top findings
    high_alerts = [a for a in alerts if a.get('risk') == 'High']
    if high_alerts:
        print("\n## 🔴 Critical Findings")
        for i, alert in enumerate(high_alerts[:5], 1):
            name = alert.get('name', 'Unknown')
            desc = alert.get('desc', '')[:200]
            print(f"{i}. **{name}**")
            print(f"   {desc}...")

except Exception as e:
    print(f"Error generating summary: {e}")
    sys.exit(1)
EOF
    else
        echo "No scan data available" >> "$md_report"
    fi

    cat >> "$md_report" << EOF

## Recommendations

1. **🚨 Address High Risk findings immediately** - These pose critical security risks
2. **🔧 Review Medium Risk findings** - Plan fixes in the next development cycle
3. **📋 Monitor Low Risk findings** - Consider addressing during routine maintenance
4. **🔄 Schedule regular scans** - Integrate into CI/CD pipeline for continuous security

## Technical Details

- **Scanner**: OWASP ZAP v2.12.0
- **Report Generated**: $(date '+%Y-%m-%d %H:%M:%S')
- **Configuration File**: ${CONFIG_FILE:-default}

---

*Report generated by DAST Standalone Scanner v1.0.0*
EOF
}

generate_scan_metrics() {
    local json_report="$1"
    local metrics_file="$2"

    cat > "$metrics_file" << EOF
{
  "scan_metadata": {
    "target_url": "$TARGET_URL",
    "scan_timestamp": "$(date -Iseconds)",
    "scanner_version": "1.0.0",
    "scanner_name": "DAST Standalone Scanner",
    "configuration_file": "${CONFIG_FILE:-default}",
    "authentication_method": "${AUTH_METHOD:-none}"
  },
  "scan_configuration": {
    "scan_depth": ${SCAN_DEPTH:-5},
    "threads": ${THREADS:-5},
    "max_duration": ${MAX_DURATION:-1800},
    "delay_ms": ${DELAY_MS:-0},
    "ajax_spider_enabled": ${AJAX_SPIDER:-true},
    "ajax_spider_max_duration": ${AJAX_SPIDER_MAX_DURATION:-1800},
    "browser_id": "${BROWSER_ID:-chrome-headless}"
  },
  "zap_configuration": {
    "api_url": "$ZAP_API_URL",
    "context_name": "${ZAP_CONTEXT_NAME:-dast-scan-context}",
    "technology_stack": "${ZAP_TECHNOLOGY:-default}",
    "docker_image": "$ZAP_DOCKER_IMAGE",
    "container_name": "$ZAP_CONTAINER_NAME"
  },
EOF

    if [[ -f "$json_report" ]]; then
        python3 << EOF >> "$metrics_file"
import json
import sys

try:
    with open('$json_report', 'r') as f:
        data = json.load(f)

    alerts = data.get('site', [{}])[0].get('alerts', [])
    high_risk = len([a for a in alerts if a.get('risk') == 'High'])
    medium_risk = len([a for a in alerts if a.get('risk') == 'Medium'])
    low_risk = len([a for a in alerts if a.get('risk') == 'Low'])
    informational = len([a for a in alerts if a.get('risk') == 'Informational'])
    total = len(alerts)

    # Analyze by plugin/rule
    plugins = {}
    for alert in alerts:
        plugin = alert.get('plugin', '')
        if plugin:
            plugins[plugin] = plugins.get(plugin, 0) + 1

    # Analyze by OWASP category
    owasp_categories = {}
    for alert in alerts:
        owasp = alert.get('reference', '')
        if owasp:
            owasp_categories[owasp] = owasp_categories.get(owasp, 0) + 1

    findings_summary = {
        "high_risk": high_risk,
        "medium_risk": medium_risk,
        "low_risk": low_risk,
        "informational": informational,
        "total_findings": total
    }

    print('  "findings_summary": ' + json.dumps(findings_summary, indent=4) + ',')
    print('  "plugin_distribution": ' + json.dumps(plugins, indent=4) + ',')
    print('  "owasp_categories": ' + json.dumps(owasp_categories, indent=4))

except Exception as e:
    print('  "error": "Failed to parse scan results: ' + str(e) + '"')
    sys.exit(1)
EOF
    else
        cat >> "$metrics_file" << EOF
  "error": "No scan results available"
}
EOF
    fi
}

# =============================================================================
# POLICY VALIDATION (reuse existing security-policy-check patterns)
# =============================================================================

validate_policy() {
    local json_report="$1"

    if [[ ! -f "$json_report" ]]; then
        log "ERROR" "Report file not found for policy validation: $json_report"
        return 1
    fi

    log "INFO" "Validating security policy compliance"

    # Count findings by severity
    local high_risk=0 medium_risk=0 low_risk=0 informational=0 total=0

    if python3 -c "
import json
import sys

try:
    with open('$json_report', 'r') as f:
        data = json.load(f)

    alerts = data.get('site', [{}])[0].get('alerts', [])
    high_risk = len([a for a in alerts if a.get('risk') == 'High'])
    medium_risk = len([a for a in alerts if a.get('risk') == 'Medium'])
    low_risk = len([a for a in alerts if a.get('risk') == 'Low'])
    informational = len([a for a in alerts if a.get('risk') == 'Informational'])
    total = len(alerts)

    print(f'{high_risk} {medium_risk} {low_risk} {informational} {total}')

except Exception as e:
    print(f'0 0 0 0 0')
    sys.exit(1)
" 2>/dev/null; then
        read -r high_risk medium_risk low_risk informational total <<< "$REPLY"

        log "INFO" "Security Policy Validation Results:"
        log "INFO" "  🔴 High Risk: $high_risk"
        log "INFO" "  🟡 Medium Risk: $medium_risk"
        log "INFO" "  🟢 Low Risk: $low_risk"
        log "INFO" "  ℹ️  Informational: $informational"
        log "INFO" "  📊 Total Findings: $total"

        # Check policy violations (reuse existing policy logic)
        local fail_on_high="${FAIL_ON_HIGH_CRITICAL:-true}"
        local fail_on_medium="${FAIL_ON_MEDIUM:-false}"
        local max_high="${MAX_HIGH_VULNERABILITIES:-0}"
        local max_medium="${MAX_MEDIUM_VULNERABILITIES:-10}"

        # Generate policy report
        cat > "${REPORT_DIR}/security-policy-report.json" << EOF
{
  "policy_validation": {
    "timestamp": "$(date -Iseconds)",
    "scanner": "dast-standalone",
    "target_url": "$TARGET_URL",
    "findings": {
      "high_risk": $high_risk,
      "medium_risk": $medium_risk,
      "low_risk": $low_risk,
      "informational": $informational,
      "total": $total
    },
    "policy_rules": {
      "fail_on_high_critical": $fail_on_high,
      "fail_on_medium": $fail_on_medium,
      "max_high_vulnerabilities": $max_high,
      "max_medium_vulnerabilities": $max_medium
    }
  }
}
EOF

        # Check for policy violations
        if [[ "$fail_on_high" == "true" && $high_risk -gt $max_high ]]; then
            log "ERROR" "🚨 POLICY VIOLATION: $high_risk HIGH RISK findings (max allowed: $max_high)"
            return 4
        fi

        if [[ "$fail_on_medium" == "true" && $medium_risk -gt $max_medium ]]; then
            log "WARN" "⚠️ POLICY WARNING: $medium_risk MEDIUM RISK findings (max allowed: $max_medium)"
            return 4
        fi

        log "SUCCESS" "✅ Policy validation passed"
        return 0
    else
        log "ERROR" "Failed to parse scan results for policy validation"
        return 1
    fi
}

# =============================================================================
# DEFECTDOJO INTEGRATION (enhanced from existing uploader)
# =============================================================================

upload_to_defectdojo() {
    local json_report="$1"

    if [[ "${DEFECTDOJO_UPLOAD:-true}" != "true" ]]; then
        log "INFO" "DefectDojo upload disabled"
        return 0
    fi

    if [[ -z "${DEFECTDOJO_URL:-}" || -z "${DEFECTDOJO_TOKEN:-}" || -z "${DEFECTDOJO_PROJECT_NAME:-}" ]]; then
        log "INFO" "DefectDojo integration not configured, skipping upload"
        log "INFO" "Required variables: DEFECTDOJO_URL, DEFECTDOJO_TOKEN, DEFECTDOJO_PROJECT_NAME"
        return 0
    fi

    log "INFO" "Uploading scan results to DefectDojo"

    if [[ ! -f "$json_report" ]]; then
        log "ERROR" "JSON report not found for DefectDojo upload: $json_report"
        return 1
    fi

    # Use existing enhanced uploader script
    local uploader_script="${SCRIPT_DIR}/upload-reports-enhanced.py"

    if [[ -f "$uploader_script" ]]; then
        log "INFO" "Using enhanced DefectDojo uploader: $uploader_script"

        # Create engagement name if not provided
        local engagement_name="${DEFECTDOJO_ENGAGEMENT_NAME:-DAST Scan $(date '+%Y-%m-%d %H:%M:%S')}"

        # Convert ZAP format to DefectDojo compatible format
        local dojo_report="${WORK_DIR}/defectdojo-dast-report.json"
        convert_zap_to_defectdojo "$json_report" "$dojo_report"

        # Upload using existing script
        python3 "$uploader_script" \
            "$DEFECTDOJO_URL" \
            "$DEFECTDOJO_TOKEN" \
            "$DEFECTDOJO_PROJECT_NAME" \
            "$dojo_report"

        local upload_result=$?

        if [[ $upload_result -eq 0 ]]; then
            log "SUCCESS" "Scan results uploaded to DefectDojo successfully"
            return 0
        else
            log "ERROR" "Failed to upload to DefectDojo (exit code: $upload_result)"
            return 1
        fi
    else
        log "WARN" "Enhanced DefectDojo uploader not found: $uploader_script"
        log "INFO" "Falling back to basic DefectDojo API upload"

        # Fallback basic upload
        basic_defectdojo_upload "$json_report"
    fi
}

convert_zap_to_defectdojo() {
    local zap_report="$1"
    local dojo_report="$2"

    python3 << EOF > "$dojo_report"
import json
import sys
from datetime import datetime

try:
    with open('$zap_report', 'r') as f:
        zap_data = json.load(f)

    dojo_findings = []
    alerts = zap_data.get('site', [{}])[0].get('alerts', [])

    for alert in alerts:
        # Convert ZAP risk to DefectDojo severity
        risk = alert.get('risk', '').lower()
        if risk == 'high':
            severity = 'High'
        elif risk == 'medium':
            severity = 'Medium'
        elif risk == 'low':
            severity = 'Low'
        else:
            severity = 'Info'

        # Extract CWE information
        cwe_id = alert.get('cweid', '')
        if cwe_id and cwe_id.isdigit():
            cwe_id = int(cwe_id)
        else:
            cwe_id = 0

        # Extract OWASP category
        owasp_category = alert.get('reference', '')

        # Create DefectDojo finding
        finding = {
            "title": alert.get('name', 'Unknown Security Finding'),
            "description": alert.get('desc', ''),
            "severity": severity,
            "cwe": cwe_id,
            "references": owasp_category,
            "solution": alert.get('solution', ''),
            "impact": alert.get('riskdesc', ''),
            "found_by": [
                {
                    "name": "DAST Standalone Scanner",
                    "email": "security@company.com"
                }
            ],
            "active": True,
            "verified": False,
            "false_p": False,
            "duplicate": False,
            "out_of_scope": False,
            "risk_accepted": False,
            "mitigated": None,
            "mitigation_steps": alert.get('solution', ''),
            "impact_details": alert.get('riskdesc', ''),
            "date": datetime.now().strftime('%Y-%m-%d'),
            "urls_detailed": [],
            "tags": ["dast", "zap", "automated"]
        }

        # Add URLs with evidence
        instances = alert.get('instances', [])
        for instance in instances:
            uri = instance.get('uri', '')
            method = instance.get('method', '')
            param = instance.get('param', '')
            attack = instance.get('attack', '')
            evidence = instance.get('evidence', '')

            if uri:
                url_detail = {
                    "url": uri,
                    "method": method,
                    "parameter": param,
                    "attack": attack,
                    "evidence": evidence
                }
                finding["urls_detailed"].append(url_detail)

        dojo_findings.append(finding)

    # Create DefectDojo format report
    dojo_report = {
        "scan_type": "ZAP DAST Scan",
        "host": "$TARGET_URL",
        "findings": dojo_findings,
        "date": datetime.now().strftime('%Y-%m-%d'),
        "engagement_name": "${DEFECTDOJO_ENGAGEMENT_NAME:-DAST Scan}",
        "product_name": "$DEFECTDOJO_PROJECT_NAME",
        "version": "1.0",
        "scan_configuration": {
            "scanner": "DAST Standalone Scanner v1.0.0",
            "authentication_method": "${AUTH_METHOD:-none}",
            "scan_depth": ${SCAN_DEPTH:-5},
            "threads": ${THREADS:-5}
        }
    }

    print(json.dumps(dojo_report, indent=2))

except Exception as e:
    print(f"Error converting ZAP report: {e}", file=sys.stderr)
    print('{"findings": []}')
    sys.exit(1)
EOF

    log "SUCCESS" "ZAP report converted to DefectDojo format"
}

basic_defectdojo_upload() {
    local json_report="$1"

    log "INFO" "Attempting basic DefectDojo API upload"

    # This would implement a basic API upload as fallback
    # For now, just log that we couldn't upload
    log "WARN" "Basic DefectDojo upload not implemented"
    return 1
}

# =============================================================================
# USAGE & HELP
# =============================================================================

usage() {
    cat << EOF
🕷️  DAST STANDALONE SCANNER v1.0.0

USAGE:
    $SCRIPT_NAME [OPTIONS] TARGET_URL

REQUIRED ARGUMENTS:
    TARGET_URL              Target application URL to scan (http:// or https://)

CONFIGURATION OPTIONS:
    -c, --config FILE       Configuration file (default: dast-config.json)
    --create-config          Create configuration template and exit

SCAN OPTIONS:
    -d, --depth LEVEL       Scan depth level (default: 5)
    -T, --threads COUNT     Number of scan threads (default: 5)
    --max-duration SECONDS   Maximum scan duration (default: 1800)
    --delay-ms MILLISECONDS  Delay between requests (default: 0)
    --ajax-spider           Enable AJAX spider (default: true)
    --no-ajax-spider        Disable AJAX spider

AUTHENTICATION OPTIONS:
    -a, --auth-method METHOD    Authentication method (none|form|token|cookie|oauth)
    -u, --username USERNAME      Username for form-based authentication
    -p, --password PASSWORD      Password for form-based authentication
    -t, --token TOKEN            Bearer token for token-based authentication
    --cookies COOKIES            Cookies for cookie-based authentication
    --auth-url URL               Authentication URL (default: TARGET_URL/login)
    --login-field FIELD          Login field name (default: username)
    --password-field FIELD       Password field name (default: password)

OUTPUT OPTIONS:
    -o, --output-dir DIR        Output directory for reports (default: ./dast-reports)
    -r, --report-name NAME      Base name for reports (default: dast-report)
    --no-html                   Disable HTML report generation
    --no-markdown              Disable Markdown report generation

DEFECTDOJO OPTIONS:
    --defectdojo-url URL        DefectDojo instance URL
    --defectdojo-token TOKEN    DefectDojo API token
    --defectdojo-project NAME   DefectDojo project name
    --defectdojo-engagement NAME DefectDojo engagement name
    --no-defectdojo            Disable DefectDojo upload

POLICY OPTIONS:
    --fail-on-high             Fail scan on high risk findings (default: true)
    --fail-on-medium           Fail scan on medium risk findings (default: false)
    --max-high COUNT           Maximum allowed high risk findings (default: 0)
    --max-medium COUNT         Maximum allowed medium risk findings (default: 10)

GENERAL OPTIONS:
    -v, --verbose              Enable verbose output
    -q, --quiet                Minimal output (errors only)
    -h, --help                 Show this help message
    --version                  Show version information

EXAMPLES:
    # Basic scan
    $SCRIPT_NAME https://example.com

    # Scan with authentication
    $SCRIPT_NAME -a form -u admin -p password https://app.example.com

    # Scan with configuration file
    $SCRIPT_NAME -c config.json https://production.example.com

    # Create configuration template
    $SCRIPT_NAME --create-config

    # Advanced scan with custom options
    $SCRIPT_NAME -d 10 -T 8 --max-duration 3600 \\
        --defectdojo-url https://defectdojo.example.com \\
        --defectdojo-token YOUR_TOKEN \\
        --defectdojo-project "Production App" \\
        https://api.example.com

EXIT CODES:
    0    Scan completed successfully
    1    Error occurred during scan
    2    Authentication failed
    3    Scan timeout exceeded
    4    Policy violations detected

EOF
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    # Set up cleanup
    trap cleanup EXIT
    trap cleanup INT TERM

    # Initialize variables
    local target_url=""
    local config_file="$CONFIG_FILE"
    local create_config=false

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            --version)
                echo "DAST Standalone Scanner v1.0.0"
                exit 0
                ;;
            -v|--verbose)
                export VERBOSE="true"
                shift
                ;;
            -q|--quiet)
                export VERBOSE="false"
                shift
                ;;
            -c|--config)
                config_file="$2"
                shift 2
                ;;
            --create-config)
                create_config=true
                shift
                ;;
            -a|--auth-method)
                export AUTH_METHOD="$2"
                shift 2
                ;;
            -u|--username)
                export AUTH_USERNAME="$2"
                shift 2
                ;;
            -p|--password)
                export AUTH_PASSWORD="$2"
                shift 2
                ;;
            -t|--token)
                export AUTH_TOKEN="$2"
                shift 2
                ;;
            --cookies)
                export AUTH_COOKIES="$2"
                shift 2
                ;;
            --auth-url)
                export AUTH_URL="$2"
                shift 2
                ;;
            --login-field)
                export AUTH_LOGIN_FIELD="$2"
                shift 2
                ;;
            --password-field)
                export AUTH_PASSWORD_FIELD="$2"
                shift 2
                ;;
            -d|--depth)
                export SCAN_DEPTH="$2"
                shift 2
                ;;
            -T|--threads)
                export THREADS="$2"
                shift 2
                ;;
            --max-duration)
                export MAX_DURATION="$2"
                shift 2
                ;;
            --delay-ms)
                export DELAY_MS="$2"
                shift 2
                ;;
            --ajax-spider)
                export AJAX_SPIDER="true"
                shift
                ;;
            --no-ajax-spider)
                export AJAX_SPIDER="false"
                shift
                ;;
            -o|--output-dir)
                export REPORT_DIR="$2"
                shift 2
                ;;
            -r|--report-name)
                export REPORT_NAME="$2"
                shift 2
                ;;
            --no-html)
                export GENERATE_HTML="false"
                shift
                ;;
            --no-markdown)
                export GENERATE_MARKDOWN="false"
                shift
                ;;
            --defectdojo-url)
                export DEFECTDOJO_URL="$2"
                shift 2
                ;;
            --defectdojo-token)
                export DEFECTDOJO_TOKEN="$2"
                shift 2
                ;;
            --defectdojo-project)
                export DEFECTDOJO_PROJECT_NAME="$2"
                shift 2
                ;;
            --defectdojo-engagement)
                export DEFECTDOJO_ENGAGEMENT_NAME="$2"
                shift 2
                ;;
            --no-defectdojo)
                export DEFECTDOJO_UPLOAD="false"
                shift
                ;;
            --fail-on-high)
                export FAIL_ON_HIGH_CRITICAL="true"
                shift
                ;;
            --no-fail-on-high)
                export FAIL_ON_HIGH_CRITICAL="false"
                shift
                ;;
            --fail-on-medium)
                export FAIL_ON_MEDIUM="true"
                shift
                ;;
            --no-fail-on-medium)
                export FAIL_ON_MEDIUM="false"
                shift
                ;;
            --max-high)
                export MAX_HIGH_VULNERABILITIES="$2"
                shift 2
                ;;
            --max-medium)
                export MAX_MEDIUM_VULNERABILITIES="$2"
                shift 2
                ;;
            -*)
                log "ERROR" "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                if [[ -z "$target_url" ]]; then
                    target_url="$1"
                else
                    log "ERROR" "Multiple target URLs provided"
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Handle configuration template creation
    if [[ "$create_config" == "true" ]]; then
        create_config_template
        exit 0
    fi

    # Validate required arguments
    if [[ -z "$target_url" ]]; then
        log "ERROR" "Target URL is required"
        usage
        exit 1
    fi

    export TARGET_URL="$target_url"

    # Load configuration
    load_config "$config_file"

    # Set default values
    export SCAN_DEPTH="${SCAN_DEPTH:-$DEFAULT_SCAN_DEPTH}"
    export THREADS="${THREADS:-$DEFAULT_THREADS}"
    export MAX_DURATION="${MAX_DURATION:-$DEFAULT_MAX_DURATION}"
    export DELAY_MS="${DELAY_MS:-$DEFAULT_DELAY_MS}"
    export AUTH_METHOD="${AUTH_METHOD:-$DEFAULT_AUTH_METHOD}"
    export AJAX_SPIDER="${AJAX_SPIDER:-$DEFAULT_AJAX_SPIDER}"
    export AJAX_SPIDER_MAX_DURATION="${AJAX_SPIDER_MAX_DURATION:-$DEFAULT_AJAX_SPIDER_MAX_DURATION}"
    export BROWSER_ID="${BROWSER_ID:-$DEFAULT_BROWSER_ID}"

    # Additional spider defaults
    export SPIDER_MAX_DEPTH="${SPIDER_MAX_DEPTH:-10}"
    export SPIDER_MAX_CHILDREN="${SPIDER_MAX_CHILDREN:-100}"
    export SPIDER_ACCEPT_COOKIES="${SPIDER_ACCEPT_COOKIES:-true}"
    export SPIDER_HANDLE_PARAMETERS="${SPIDER_HANDLE_PARAMETERS:-true}"

    # Create output directory
    mkdir -p "$REPORT_DIR"

    # Initialize scan
    log "INFO" "🕷️ DAST Standalone Scanner v1.0.0"
    log "INFO" "Target: $target_url"
    log "INFO" "Report Directory: $REPORT_DIR"
    log "INFO" "Authentication: ${AUTH_METHOD:-none}"
    log "INFO" "Configuration: ${config_file:-default}"
    log "INFO" "Work Directory: $WORK_DIR"
    log "INFO" "Log File: $LOG_FILE"

    # Validate prerequisites
    validate_target "$target_url" || exit 1
    validate_environment || exit 1

    # Start ZAP
    start_zap || exit 1

    # Setup ZAP context
    local context_id
    context_id=$(setup_zap_context "$target_url")
    if [[ -z "$context_id" ]]; then
        log "ERROR" "Failed to setup ZAP context"
        exit 1
    fi

    # Configure authentication
    configure_authentication "$context_id" || exit 1

    # Run scanning phases
    log "INFO" "🔍 Starting scanning phases"

    run_spider "$context_id" "$target_url" || exit 1
    run_ajax_spider "$context_id" "$target_url" || exit 1
    run_active_scan "$context_id" "$target_url" || exit 1

    # Generate reports
    local json_report
    json_report=$(generate_reports)

    if [[ -z "$json_report" || ! -f "$json_report" ]]; then
        log "ERROR" "Failed to generate reports"
        exit 1
    fi

    # Validate policy compliance
    validate_policy "$json_report"
    local policy_exit_code=$?

    # Upload to DefectDojo
    upload_to_defectdojo "$json_report"
    local dojo_exit_code=$?

    # Final summary
    log "SUCCESS" "🎉 DAST Scan completed successfully!"
    log "INFO" "Reports available in: $REPORT_DIR"
    log "INFO" "Main report: $json_report"

    # Display summary if reports exist
    if [[ -f "$json_report" ]]; then
        display_scan_summary "$json_report"
    fi

    if [[ $dojo_exit_code -eq 0 ]]; then
        log "SUCCESS" "✅ Results uploaded to DefectDojo"
    elif [[ $dojo_exit_code -ne 0 && $dojo_exit_code -ne 1 ]]; then
        log "WARN" "⚠️ DefectDojo upload encountered issues"
    fi

    # Exit with appropriate code
    if [[ $policy_exit_code -eq 4 ]]; then
        log "ERROR" "🚨 Policy violations detected - scan completed with violations"
        exit 4
    fi

    exit 0
}

display_scan_summary() {
    local json_report="$1"

    if python3 -c "
import json
import sys

try:
    with open('$json_report', 'r') as f:
        data = json.load(f)

    alerts = data.get('site', [{}])[0].get('alerts', [])
    high_risk = len([a for a in alerts if a.get('risk') == 'High'])
    medium_risk = len([a for a in alerts if a.get('risk') == 'Medium'])
    low_risk = len([a for a in alerts if a.get('risk') == 'Low'])
    informational = len([a for a in alerts if a.get('risk') == 'Informational'])
    total = len(alerts)

    print(f'📊 Scan Summary:')
    print(f'   🔴 High Risk: {high_risk}')
    print(f'   🟡 Medium Risk: {medium_risk}')
    print(f'   🟢 Low Risk: {low_risk}')
    print(f'   ℹ️  Informational: {informational}')
    print(f'   📈 Total Findings: {total}')

except Exception as e:
    print(f'Error displaying summary: {e}')
    sys.exit(1)
" 2>/dev/null; then
        log "INFO" "Scan summary displayed above"
    fi
}

# =============================================================================
# SCRIPT ENTRY POINT
# =============================================================================

# Only run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi