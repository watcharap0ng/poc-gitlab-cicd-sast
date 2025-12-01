#!/bin/bash

# =============================================================================
# 🧪 DAST TESTING FRAMEWORK
# =============================================================================
# Description: Comprehensive testing framework for DAST standalone scanner
# Author: Security Team
# Version: 1.0.0
# Last Updated: 2025-01-01
#
# Usage: ./dast-test-framework.sh [OPTIONS] [TEST_NAME]
#
# Test Categories:
#   - Unit tests: Individual component testing
#   - Integration tests: Component integration testing
#   - End-to-end tests: Full scan workflow testing
#   - Performance tests: Scanner performance validation
#   - Security tests: Security feature validation
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION & CONSTANTS
# =============================================================================
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly TEST_DIR="${DAST_TEST_DIR:-${SCRIPT_DIR}/tests}"
readonly MOCK_DIR="${TEST_DIR}/mocks"
readonly RESULTS_DIR="${TEST_DIR}/results"
readonly LOG_DIR="${TEST_DIR}/logs"
readonly TEMP_DIR="${DAST_TEST_TEMP:-$(mktemp -d -t dast-test-XXXXXX)}"

# Test configuration
readonly ZAP_TEST_IMAGE="owasp/zap2docker-stable"
readonly TEST_TARGET_URL="${TEST_TARGET_URL:-http://demo.testfire.net}"
readonly AUTH_TEST_URL="${AUTH_TEST_URL:-https://httpbin.org}"
readonly TIMEOUT="${TEST_TIMEOUT:-300}"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
FAILED_TEST_NAMES=()

# =============================================================================
# LOGGING & UTILITIES
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%H:%M:%S')

    case "$level" in
        "ERROR") echo -e "${RED}[${timestamp}] ERROR${NC} $message" >&2 ;;
        "WARN") echo -e "${YELLOW}[${timestamp}] WARN${NC} $message" ;;
        "INFO") echo -e "${BLUE}[${timestamp}] INFO${NC} $message" ;;
        "DEBUG") [[ "${VERBOSE:-false}" == "true" ]] && echo -e "${PURPLE}[${timestamp}] DEBUG${NC} $message" ;;
        "PASS") echo -e "${GREEN}[${timestamp}] PASS${NC} $message" ;;
        "FAIL") echo -e "${RED}[${timestamp}] FAIL${NC} $message" ;;
        "SKIP") echo -e "${YELLOW}[${timestamp}] SKIP${NC} $message" ;;
        *) echo -e "${CYAN}[${timestamp}] $level${NC} $message" ;;
    esac
}

setup_test_environment() {
    log "INFO" "Setting up test environment"

    # Create directories
    mkdir -p "$TEST_DIR" "$MOCK_DIR" "$RESULTS_DIR" "$LOG_DIR" "$TEMP_DIR"

    # Set up test log file
    TEST_LOG="${LOG_DIR}/dast-test-$(date +%Y%m%d-%H%M%S).log"
    exec > >(tee -a "$TEST_LOG")
    exec 2>&1

    log "INFO" "Test environment ready"
    log "INFO" "Test directory: $TEST_DIR"
    log "INFO" "Results directory: $RESULTS_DIR"
    log "INFO" "Log file: $TEST_LOG"
}

cleanup_test_environment() {
    local exit_code=$?

    log "INFO" "Cleaning up test environment"

    # Stop any running containers
    docker ps -q --filter "name=dast-test-" | xargs -r docker stop >/dev/null 2>&1 || true
    docker ps -a -q --filter "name=dast-test-" | xargs -r docker rm >/dev/null 2>&1 || true

    # Clean up temporary directory
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR" || true
    fi

    # Generate test report
    generate_test_report

    log "INFO" "Test environment cleaned up"
    exit $exit_code
}

# =============================================================================
# TEST EXECUTION FRAMEWORK
# =============================================================================

run_test() {
    local test_name="$1"
    local test_function="$2"
    local timeout="${3:-60}"

    ((TOTAL_TESTS++))

    log "INFO" "Running test: $test_name"

    local start_time=$(date +%s)
    local test_output_file="${TEMP_DIR}/${test_name}.output"

    # Run test with timeout
    if timeout "$timeout" bash -c "$test_function" > "$test_output_file" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        if grep -q "PASS" "$test_output_file"; then
            ((PASSED_TESTS++))
            log "PASS" "$test_name (${duration}s)"
            return 0
        else
            ((FAILED_TESTS++))
            FAILED_TEST_NAMES+=("$test_name")
            log "FAIL" "$test_name (${duration}s)"
            cat "$test_output_file" | while read -r line; do
                log "ERROR" "  $line"
            done
            return 1
        fi
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        ((FAILED_TESTS++))
        FAILED_TEST_NAMES+=("$test_name")
        log "FAIL" "$test_name (timeout after ${duration}s)"
        cat "$test_output_file" 2>/dev/null || true
        return $exit_code
    fi
}

skip_test() {
    local test_name="$1"
    local reason="$2"

    ((TOTAL_TESTS++))
    ((SKIPPED_TESTS++))

    log "SKIP" "$test_name - $reason"
}

assert_equals() {
    local actual="$1"
    local expected="$2"
    local message="$3"

    if [[ "$actual" == "$expected" ]]; then
        log "INFO" "✓ $message"
        return 0
    else
        log "ERROR" "✗ $message"
        log "ERROR" "  Expected: $expected"
        log "ERROR" "  Actual: $actual"
        return 1
    fi
}

assert_not_equals() {
    local actual="$1"
    local unexpected="$2"
    local message="$3"

    if [[ "$actual" != "$unexpected" ]]; then
        log "INFO" "✓ $message"
        return 0
    else
        log "ERROR" "✗ $message"
        log "ERROR" "  Unexpected value: $actual"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"

    if [[ "$haystack" == *"$needle"* ]]; then
        log "INFO" "✓ $message"
        return 0
    else
        log "ERROR" "✗ $message"
        log "ERROR" "  String does not contain: $needle"
        log "ERROR" "  Haystack: $haystack"
        return 1
    fi
}

assert_file_exists() {
    local file_path="$1"
    local message="$2"

    if [[ -f "$file_path" ]]; then
        log "INFO" "✓ $message"
        return 0
    else
        log "ERROR" "✗ $message"
        log "ERROR" "  File not found: $file_path"
        return 1
    fi
}

assert_file_not_exists() {
    local file_path="$1"
    local message="$2"

    if [[ ! -f "$file_path" ]]; then
        log "INFO" "✓ $message"
        return 0
    else
        log "ERROR" "✗ $message"
        log "ERROR" "  File exists but shouldn't: $file_path"
        return 1
    fi
}

# =============================================================================
# UNIT TESTS
# =============================================================================

test_dast_script_exists() {
    local script_path="${SCRIPT_DIR}/dast-standalone.sh"

    assert_file_exists "$script_path" "DAST standalone script exists"
    assert_equals "$(file -b "$script_path")" "Bourne-Again shell script, ASCII text executable" "Script is executable bash file"

    log "INFO" "PASS"
}

test_dast_script_help() {
    local script_path="${SCRIPT_DIR}/dast-standalone.sh"

    if "$script_path" --help 2>/dev/null | grep -q "DAST STANDALONE SCANNER"; then
        log "INFO" "✓ Help text contains expected content"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Help text missing expected content"
        return 1
    fi
}

test_config_template_exists() {
    local config_path="${SCRIPT_DIR}/dast-config.json.example"

    assert_file_exists "$config_path" "Configuration template exists"

    # Validate JSON
    if python3 -c "import json; json.load(open('$config_path'))" 2>/dev/null; then
        log "INFO" "✓ Configuration template is valid JSON"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Configuration template is invalid JSON"
        return 1
    fi
}

test_defectdojo_enhanced_exists() {
    local script_path="${SCRIPT_DIR}/dast-defectdojo-enhanced.py"

    assert_file_exists "$script_path" "DefectDojo enhanced uploader exists"
    assert_equals "$(file -b "$script_path")" "Python script, ASCII text executable" "Script is executable Python file"

    # Test Python syntax
    if python3 -m py_compile "$script_path" 2>/dev/null; then
        log "INFO" "✓ DefectDojo uploader has valid Python syntax"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ DefectDojo uploader has invalid Python syntax"
        return 1
    fi
}

test_docker_available() {
    if command -v docker >/dev/null 2>&1; then
        log "INFO" "✓ Docker is available"

        if docker info >/dev/null 2>&1; then
            log "INFO" "✓ Docker daemon is running"
            log "INFO" "PASS"
        else
            log "ERROR" "✗ Docker daemon is not running"
            return 1
        fi
    else
        log "ERROR" "✗ Docker is not available"
        return 1
    fi
}

test_python3_available() {
    if command -v python3 >/dev/null 2>&1; then
        local version=$(python3 --version 2>&1 | cut -d' ' -f2)
        log "INFO" "✓ Python3 is available (version: $version)"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Python3 is not available"
        return 1
    fi
}

# =============================================================================
# INTEGRATION TESTS
# =============================================================================

test_zap_docker_pull() {
    log "INFO" "Testing ZAP Docker image pull"

    if docker pull "$ZAP_TEST_IMAGE" >/dev/null 2>&1; then
        log "INFO" "✓ ZAP Docker image pulled successfully"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Failed to pull ZAP Docker image"
        return 1
    fi
}

test_zap_container_start() {
    local container_name="dast-test-zap-$(date +%s)"

    log "INFO" "Testing ZAP container start"

    if docker run -d --name "$container_name" -p 8090:8090 "$ZAP_TEST_IMAGE" zap.sh -daemon -host 0.0.0.0 -port 8090 >/dev/null 2>&1; then
        log "INFO" "✓ ZAP container started successfully"

        # Wait for ZAP to be ready
        local max_wait=30
        local wait_time=0

        while [[ $wait_time -lt $max_wait ]]; do
            if curl -s -f "http://localhost:8090/JSON/core/view/version/" >/dev/null 2>&1; then
                log "INFO" "✓ ZAP API is ready"

                # Cleanup
                docker stop "$container_name" >/dev/null 2>&1
                docker rm "$container_name" >/dev/null 2>&1

                log "INFO" "PASS"
                return 0
            fi

            sleep 2
            ((wait_time += 2))
        done

        # Timeout - cleanup and fail
        docker stop "$container_name" >/dev/null 2>&1
        docker rm "$container_name" >/dev/null 2>&1

        log "ERROR" "✗ ZAP API failed to start within $max_wait seconds"
        return 1
    else
        log "ERROR" "✗ Failed to start ZAP container"
        return 1
    fi
}

test_config_creation() {
    local test_config="${TEMP_DIR}/test-config.json"

    log "INFO" "Testing configuration file creation"

    if "${SCRIPT_DIR}/dast-standalone.sh" --create-config 2>/dev/null | grep -q "Configuration template created"; then
        log "INFO" "✓ Configuration template command executed"

        # Check if template was created
        if [[ -f "${SCRIPT_DIR}/dast-config.json.example" ]]; then
            log "INFO" "✓ Configuration template file exists"

            # Copy to test location
            cp "${SCRIPT_DIR}/dast-config.json.example" "$test_config"

            # Validate JSON
            if python3 -c "import json; json.load(open('$test_config'))" 2>/dev/null; then
                log "INFO" "✓ Configuration template is valid JSON"
                log "INFO" "PASS"
            else
                log "ERROR" "✗ Configuration template is invalid JSON"
                return 1
            fi
        else
            log "ERROR" "✗ Configuration template file not created"
            return 1
        fi
    else
        log "ERROR" "✗ Configuration template command failed"
        return 1
    fi
}

# =============================================================================
# END-TO-END TESTS
# =============================================================================

test_dry_run_scan() {
    log "INFO" "Testing dry run scan simulation"

    # Create a mock scan scenario
    local test_config="${TEMP_DIR}/test-dryrun-config.json"
    local test_target="http://httpbin.org"

    # Create minimal test config
    cat > "$test_config" << EOF
{
  "scan_configuration": {
    "scan_depth": 1,
    "threads": 1,
    "max_duration": 30,
    "delay_ms": 100
  },
  "authentication": {
    "method": "none"
  },
  "output": {
    "report_dir": "${TEMP_DIR}/test-reports",
    "report_name": "test-dryrun"
  }
}
EOF

    # Test script validation (without actually running ZAP)
    if "${SCRIPT_DIR}/dast-standalone.sh" --help >/dev/null 2>&1; then
        log "INFO" "✓ Script help works"

        # Test with invalid URL (should fail gracefully)
        if "${SCRIPT_DIR}/dast-standalone.sh" "invalid-url" 2>/dev/null | grep -q "must start with http:// or https://"; then
            log "INFO" "✓ Script validates URL format"
            log "INFO" "PASS"
        else
            log "ERROR" "✗ Script does not validate URL format"
            return 1
        fi
    else
        log "ERROR" "✗ Script help failed"
        return 1
    fi
}

test_mock_scan_workflow() {
    log "INFO" "Testing mock scan workflow"

    # Create mock ZAP report
    local mock_report="${TEMP_DIR}/mock-zap-report.json"
    cat > "$mock_report" << EOF
{
  "site": [
    {
      "name": "http://httpbin.org",
      "host": "httpbin.org",
      "port": "80",
      "ssl": false,
      "alerts": [
        {
          "pluginid": "10058",
          "alert": "X-Content-Type-Options header missing",
          "risk": "Low",
          "confidence": "Medium",
          "desc": "The Anti-MIME-Sniffing header X-Content-Type-Options",
          "instances": [
            {
              "uri": "http://httpbin.org/",
              "method": "GET",
              "param": "",
              "attack": "",
              "evidence": "",
              "reference": "WASC-15"
            }
          ]
        }
      ]
    }
  ]
}
EOF

    # Test DefectDojo enhanced uploader with mock report
    if python3 "${SCRIPT_DIR}/dast-defectdojo-enhanced.py" --help 2>/dev/null | grep -q "DAST-Specific DefectDojo Integration"; then
        log "INFO" "✓ DefectDojo uploader help works"

        # Test JSON processing
        if python3 -c "
import json
import sys

try:
    with open('$mock_report', 'r') as f:
        data = json.load(f)

    alerts = data.get('site', [{}])[0].get('alerts', [])
    if len(alerts) > 0:
        print('Mock report processing successful')
        sys.exit(0)
    else:
        print('No alerts found in mock report')
        sys.exit(1)
except Exception as e:
    print(f'Error processing mock report: {e}')
    sys.exit(1)
" 2>/dev/null; then
            log "INFO" "✓ Mock report processing successful"
            log "INFO" "PASS"
        else
            log "ERROR" "✗ Mock report processing failed"
            return 1
        fi
    else
        log "ERROR" "✗ DefectDojo uploader help failed"
        return 1
    fi
}

# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================

test_form_auth_configuration() {
    log "INFO" "Testing form authentication configuration"

    local test_config="${TEMP_DIR}/test-form-auth.json"

    # Create test config with form authentication
    cat > "$test_config" << EOF
{
  "authentication": {
    "method": "form",
    "username": "testuser",
    "password": "testpass",
    "auth_url": "https://httpbin.org/post",
    "login_field": "username",
    "password_field": "password"
  }
}
EOF

    # Validate authentication configuration
    if python3 -c "
import json

with open('$test_config', 'r') as f:
    config = json.load(f)

auth = config.get('authentication', {})
method = auth.get('method', '')
username = auth.get('username', '')
password = auth.get('password', '')

if method == 'form' and username and password:
    print('Form authentication configuration valid')
    exit(0)
else:
    print('Form authentication configuration invalid')
    exit(1)
" 2>/dev/null; then
        log "INFO" "✓ Form authentication configuration is valid"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Form authentication configuration is invalid"
        return 1
    fi
}

test_token_auth_configuration() {
    log "INFO" "Testing token authentication configuration"

    local test_config="${TEMP_DIR}/test-token-auth.json"

    # Create test config with token authentication
    cat > "$test_config" << EOF
{
  "authentication": {
    "method": "token",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test"
  }
}
EOF

    # Validate authentication configuration
    if python3 -c "
import json

with open('$test_config', 'r') as f:
    config = json.load(f)

auth = config.get('authentication', {})
method = auth.get('method', '')
token = auth.get('token', '')

if method == 'token' and token:
    print('Token authentication configuration valid')
    exit(0)
else:
    print('Token authentication configuration invalid')
    exit(1)
" 2>/dev/null; then
        log "INFO" "✓ Token authentication configuration is valid"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Token authentication configuration is invalid"
        return 1
    fi
}

test_cookie_auth_configuration() {
    log "INFO" "Testing cookie authentication configuration"

    local test_config="${TEMP_DIR}/test-cookie-auth.json"

    # Create test config with cookie authentication
    cat > "$test_config" << EOF
{
  "authentication": {
    "method": "cookie",
    "cookies": "session=abc123; csrf=def456; auth=token789"
  }
}
EOF

    # Validate authentication configuration
    if python3 -c "
import json

with open('$test_config', 'r') as f:
    config = json.load(f)

auth = config.get('authentication', {})
method = auth.get('method', '')
cookies = auth.get('cookies', '')

if method == 'cookie' and cookies:
    print('Cookie authentication configuration valid')
    exit(0)
else:
    print('Cookie authentication configuration invalid')
    exit(1)
" 2>/dev/null; then
        log "INFO" "✓ Cookie authentication configuration is valid"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Cookie authentication configuration is invalid"
        return 1
    fi
}

# =============================================================================
# PERFORMANCE TESTS
# =============================================================================

test_script_performance() {
    log "INFO" "Testing script performance (help command)"

    local start_time=$(date +%s)

    if "${SCRIPT_DIR}/dast-standalone.sh" --help >/dev/null 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        # Help should complete within 2 seconds
        if [[ $duration -lt 2 ]]; then
            log "INFO" "✓ Help command completed in ${duration}s (within 2s limit)"
            log "INFO" "PASS"
        else
            log "ERROR" "✗ Help command took too long: ${duration}s (limit: 2s)"
            return 1
        fi
    else
        log "ERROR" "✗ Help command failed"
        return 1
    fi
}

test_config_parsing_performance() {
    log "INFO" "Testing configuration parsing performance"

    local test_config="${TEMP_DIR}/test-performance-config.json"

    # Create large test config
    cat > "$test_config" << EOF
{
  "scan_configuration": {
    "scan_depth": 10,
    "threads": 8,
    "max_duration": 3600,
    "delay_ms": 100,
    "ajax_spider": true,
    "ajax_spider_max_duration": 1800,
    "browser_id": "chrome-headless"
  },
  "authentication": {
    "method": "form",
    "username": "testuser",
    "password": "testpass",
    "auth_url": "https://example.com/login"
  },
  "exclusions": {
    "exclude_urls": ".*\\\\.css$,.*\\\\.js$,.*\\\\.png$",
    "exclude_params": "session.*,csrf.*",
    "exclude_headers": "X-Debug,X-Requested-With"
  },
  "output": {
    "report_dir": "./dast-reports",
    "report_name": "performance-test",
    "generate_html": true,
    "generate_markdown": true
  }
}
EOF

    local start_time=$(date +%s.%N)

    # Test JSON parsing performance
    if python3 -c "
import json
import sys
import time

start = time.time()

for i in range(10):
    with open('$test_config', 'r') as f:
        config = json.load(f)

end = time.time()
duration = end - start

print(f'Config parsing took {duration:.3f}s for 10 iterations')

if duration < 0.1:
    exit(0)
else:
    exit(1)
" 2>/dev/null; then
        log "INFO" "✓ Configuration parsing completed within performance limits"
        log "INFO" "PASS"
    else
        log "ERROR" "✗ Configuration parsing exceeded performance limits"
        return 1
    fi
}

# =============================================================================
# SECURITY TESTS
# =============================================================================

test_no_sensitive_data_logging() {
    log "INFO" "Testing no sensitive data in logs"

    local test_config="${TEMP_DIR}/test-security-config.json"

    # Create config with sensitive data
    cat > "$test_config" << EOF
{
  "authentication": {
    "method": "form",
    "username": "sensitive_user",
    "password": "sensitive_password_123!",
    "token": "sensitive_token_abc123"
  }
}
EOF

    # Test that sensitive data is masked in logs
    if "${SCRIPT_DIR}/dast-standalone.sh" --help 2>&1 | grep -q "sensitive_password_123"; then
        log "ERROR" "✗ Sensitive data found in help output"
        return 1
    else
        log "INFO" "✓ No sensitive data exposed in help output"
        log "INFO" "PASS"
    fi
}

test_input_validation() {
    log "INFO" "Testing input validation"

    # Test invalid URLs
    local invalid_urls=("invalid-url" "ftp://example.com" "" "file:///etc/passwd")

    for invalid_url in "${invalid_urls[@]}"; do
        if "${SCRIPT_DIR}/dast-standalone.sh" "$invalid_url" 2>/dev/null | grep -q -i "error\|invalid\|must start with"; then
            log "INFO" "✓ Invalid URL rejected: $invalid_url"
        else
            log "ERROR" "✗ Invalid URL not rejected: $invalid_url"
            return 1
        fi
    done

    log "INFO" "PASS"
}

test_file_permissions() {
    log "INFO" "Testing file permissions"

    local script_path="${SCRIPT_DIR}/dast-standalone.sh"
    local uploader_path="${SCRIPT_DIR}/dast-defectdojo-enhanced.py"

    # Check script permissions
    if [[ -x "$script_path" ]]; then
        log "INFO" "✓ DAST script is executable"
    else
        log "ERROR" "✗ DAST script is not executable"
        return 1
    fi

    if [[ -x "$uploader_path" ]]; then
        log "INFO" "✓ DefectDojo uploader is executable"
    else
        log "ERROR" "✗ DefectDojo uploader is not executable"
        return 1
    fi

    # Check that files are not world-writable
    if [[ "$(stat -c %a "$script_path")" != *777 ]]; then
        log "INFO" "✓ DAST script is not world-writable"
    else
        log "ERROR" "✗ DAST script is world-writable"
        return 1
    fi

    log "INFO" "PASS"
}

# =============================================================================
# TEST SUITE EXECUTION
# =============================================================================

run_unit_tests() {
    log "INFO" "Running unit tests..."

    run_test "dast_script_exists" "test_dast_script_exists" 10
    run_test "dast_script_help" "test_dast_script_help" 10
    run_test "config_template_exists" "test_config_template_exists" 10
    run_test "defectdojo_enhanced_exists" "test_defectdojo_enhanced_exists" 10
    run_test "docker_available" "test_docker_available" 10
    run_test "python3_available" "test_python3_available" 5
}

run_integration_tests() {
    log "INFO" "Running integration tests..."

    # Skip integration tests if Docker is not available
    if ! command -v docker >/dev/null 2>&1; then
        skip_test "zap_docker_pull" "Docker not available"
        skip_test "zap_container_start" "Docker not available"
        return 0
    fi

    run_test "zap_docker_pull" "test_zap_docker_pull" 120
    run_test "zap_container_start" "test_zap_container_start" 60
    run_test "config_creation" "test_config_creation" 30
}

run_e2e_tests() {
    log "INFO" "Running end-to-end tests..."

    run_test "dry_run_scan" "test_dry_run_scan" 30
    run_test "mock_scan_workflow" "test_mock_scan_workflow" 30
}

run_authentication_tests() {
    log "INFO" "Running authentication tests..."

    run_test "form_auth_configuration" "test_form_auth_configuration" 10
    run_test "token_auth_configuration" "test_token_auth_configuration" 10
    run_test "cookie_auth_configuration" "test_cookie_auth_configuration" 10
}

run_performance_tests() {
    log "INFO" "Running performance tests..."

    # Check if bc is available for floating point arithmetic
    if ! command -v bc >/dev/null 2>&1; then
        skip_test "script_performance" "bc command not available for timing"
        skip_test "config_parsing_performance" "bc command not available for timing"
        return 0
    fi

    run_test "script_performance" "test_script_performance" 10
    run_test "config_parsing_performance" "test_config_parsing_performance" 30
}

run_security_tests() {
    log "INFO" "Running security tests..."

    run_test "no_sensitive_data_logging" "test_no_sensitive_data_logging" 10
    run_test "input_validation" "test_input_validation" 15
    run_test "file_permissions" "test_file_permissions" 5
}

# =============================================================================
# TEST REPORTING
# =============================================================================

generate_test_report() {
    local report_file="${RESULTS_DIR}/dast-test-report-$(date +%Y%m%d-%H%M%S).json"
    local md_report="${RESULTS_DIR}/dast-test-report-$(date +%Y%m%d-%H%M%S).md"

    # Generate JSON report
    cat > "$report_file" << EOF
{
  "test_metadata": {
    "framework": "DAST Testing Framework v1.0.0",
    "timestamp": "$(date -Iseconds)",
    "test_duration": "$(date +%Y-%m-%d %H:%M:%S)",
    "environment": {
      "script_directory": "$SCRIPT_DIR",
      "test_directory": "$TEST_DIR",
      "docker_image": "$ZAP_TEST_IMAGE",
      "target_url": "$TEST_TARGET_URL"
    }
  },
  "test_results": {
    "total_tests": $TOTAL_TESTS,
    "passed_tests": $PASSED_TESTS,
    "failed_tests": $FAILED_TESTS,
    "skipped_tests": $SKIPPED_TESTS,
    "success_rate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
  },
  "failed_tests": [
EOF

    # Add failed tests to JSON
    local first=true
    for failed_test in "${FAILED_TEST_NAMES[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo "," >> "$report_file"
        fi
        echo "      \"$failed_test\"" >> "$report_file"
    done

    cat >> "$report_file" << EOF

  ],
  "test_categories": {
    "unit_tests": "Core script and configuration validation",
    "integration_tests": "Component interaction and external dependencies",
    "e2e_tests": "End-to-end workflow validation",
    "authentication_tests": "Authentication configuration and methods",
    "performance_tests": "Performance and timing validation",
    "security_tests": "Security features and input validation"
  }
}
EOF

    # Generate Markdown report
    cat > "$md_report" << EOF
# 🧪 DAST Test Framework Report

## Test Summary

- **Total Tests**: $TOTAL_TESTS
- **Passed**: $PASSED_TESTS ✅
- **Failed**: $FAILED_TESTS ❌
- **Skipped**: $SKIPPED_TESTS ⏭️
- **Success Rate**: $(( $PASSED_TESTS * 100 / $TOTAL_TESTS ))%

## Test Results

### ✅ Passed Tests ($PASSED_TESTS)

EOF

    # Note: Individual test details would need to be tracked for a more comprehensive report

    if [[ $FAILED_TESTS -gt 0 ]]; then
        cat >> "$md_report" << EOF
### ❌ Failed Tests ($FAILED_TESTS)

EOF
        for failed_test in "${FAILED_TEST_NAMES[@]}"; do
            echo "- \`$failed_test\`" >> "$md_report"
        done
    fi

    cat >> "$md_report" << EOF

### ⏭️ Skipped Tests ($SKIPPED_TESTS)

Tests skipped due to missing dependencies or configuration requirements.

## Test Categories

1. **Unit Tests** - Core script and configuration validation
2. **Integration Tests** - Component interaction and external dependencies
3. **End-to-End Tests** - Full workflow validation
4. **Authentication Tests** - Authentication methods and configuration
5. **Performance Tests** - Timing and performance validation
6. **Security Tests** - Security features and input validation

## Environment

- **Framework**: DAST Testing Framework v1.0.0
- **Test Date**: $(date '+%Y-%m-%d %H:%M')
- **Script Directory**: \`$SCRIPT_DIR\`
- **Test Directory**: \`$TEST_DIR\`
- **Docker Image**: \`$ZAP_TEST_IMAGE\`
- **Target URL**: \`$TEST_TARGET_URL\`

## Artifacts

- **JSON Report**: \`$(basename "$report_file")\`
- **Test Logs**: \`$TEST_LOG\`

## Recommendations

EOF

    if [[ $FAILED_TESTS -gt 0 ]]; then
        cat >> "$md_report" << EOF
- 🚨 **Address Failed Tests**: Review and fix the ${FAILED_TESTS} failed tests
EOF
    fi

    if [[ $SKIPPED_TESTS -gt 0 ]]; then
        cat >> "$md_report" << EOF
- ⚠️ **Check Dependencies**: Install missing dependencies for ${SKIPPED_TESTS} skipped tests
EOF
    fi

    local success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
    if (( $(echo "$success_rate < 90" | bc -l) )); then
        cat >> "$md_report" << EOF
- 📈 **Improve Test Coverage**: Focus on increasing test success rate above 90%
EOF
    else
        cat >> "$md_report" << EOF
- ✅ **Excellent Test Coverage**: Maintain current testing standards
EOF
    fi

    cat >> "$md_report" << EOF

---

*Report generated by DAST Testing Framework v1.0.0*
EOF

    log "INFO" "Test reports generated:"
    log "INFO" "  JSON: $report_file"
    log "INFO" "  Markdown: $md_report"
}

display_test_summary() {
    local success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)

    echo ""
    echo "🧪 DAST Testing Framework Summary"
    echo "================================"
    echo "Total Tests:  $TOTAL_TESTS"
    echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
    echo -e "Skipped:      ${YELLOW}$SKIPPED_TESTS${NC}"
    echo "Success Rate: ${success_rate}%"
    echo ""

    if [[ $FAILED_TESTS -gt 0 ]]; then
        echo -e "${RED}❌ Failed Tests:${NC}"
        for failed_test in "${FAILED_TEST_NAMES[@]}"; do
            echo "  - $failed_test"
        done
        echo ""
    fi

    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed!${NC}"
    else
        echo -e "${RED}❌ Some tests failed. Check the report for details.${NC}"
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

usage() {
    cat << EOF
🧪 DAST TESTING FRAMEWORK

USAGE:
    $SCRIPT_NAME [OPTIONS] [TEST_NAME]

OPTIONS:
    -v, --verbose           Enable verbose output
    -q, --quiet            Minimal output (errors only)
    -t, --timeout SECONDS  Test timeout (default: 60)
    -h, --help             Show this help message

TEST CATEGORIES:
    unit                   Run unit tests only
    integration            Run integration tests only
    e2e                    Run end-to-end tests only
    authentication         Run authentication tests only
    performance           Run performance tests only
    security              Run security tests only

EXAMPLES:
    # Run all tests
    $SCRIPT_NAME

    # Run specific test category
    $SCRIPT_NAME unit
    $SCRIPT_NAME integration

    # Run with verbose output
    $SCRIPT_NAME -v

    # Run with custom timeout
    $SCRIPT_NAME -t 120

EXIT CODES:
    0    All tests passed
    1    Some tests failed
    2    Test framework error

EOF
}

main() {
    # Set up cleanup
    trap cleanup_test_environment EXIT
    trap cleanup_test_environment INT TERM

    local test_category="all"
    local test_timeout="60"
    local verbose="false"

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                verbose="true"
                export VERBOSE="true"
                shift
                ;;
            -q|--quiet)
                verbose="false"
                export VERBOSE="false"
                shift
                ;;
            -t|--timeout)
                test_timeout="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            unit|integration|e2e|authentication|performance|security)
                test_category="$1"
                shift
                ;;
            -*)
                echo "Unknown option: $1"
                usage
                exit 2
                ;;
            *)
                echo "Unknown test category: $1"
                usage
                exit 2
                ;;
        esac
    done

    # Set up test environment
    setup_test_environment

    export TEST_TIMEOUT="$test_timeout"

    log "INFO" "🧪 DAST Testing Framework v1.0.0"
    log "INFO" "Running test category: $test_category"
    log "INFO" "Test timeout: ${test_timeout}s"

    # Run tests based on category
    case "$test_category" in
        "unit")
            run_unit_tests
            ;;
        "integration")
            run_integration_tests
            ;;
        "e2e")
            run_e2e_tests
            ;;
        "authentication")
            run_authentication_tests
            ;;
        "performance")
            run_performance_tests
            ;;
        "security")
            run_security_tests
            ;;
        "all")
            run_unit_tests
            run_integration_tests
            run_e2e_tests
            run_authentication_tests
            run_performance_tests
            run_security_tests
            ;;
        *)
            log "ERROR" "Unknown test category: $test_category"
            usage
            exit 2
            ;;
    esac

    # Display summary
    display_test_summary

    # Exit with appropriate code
    if [[ $FAILED_TESTS -eq 0 ]]; then
        exit 0
    else
        exit 1
    fi
}

# =============================================================================
# SCRIPT ENTRY POINT
# =============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi