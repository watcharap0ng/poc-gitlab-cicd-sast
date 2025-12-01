#!/bin/bash

# =============================================================================
# 🚀 DAST QUICK TEST
# =============================================================================
# Quick validation test for DAST standalone scanner
# =============================================================================

set -euo pipefail

readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log() {
    local level="$1"
    shift
    local message="$*"

    case "$level" in
        "PASS") echo -e "${GREEN}[PASS]${NC} $message" ;;
        "FAIL") echo -e "${RED}[FAIL]${NC} $message" ;;
        "INFO") echo -e "${YELLOW}[INFO]${NC} $message" ;;
    esac
}

test_file_exists() {
    local file_path="$1"
    local description="$2"

    if [[ -f "$file_path" ]]; then
        log "PASS" "$description exists: $file_path"
        return 0
    else
        log "FAIL" "$description missing: $file_path"
        return 1
    fi
}

test_script_executable() {
    local script_path="$1"
    local description="$2"

    if [[ -x "$script_path" ]]; then
        log "PASS" "$description is executable"
        return 0
    else
        log "FAIL" "$description is not executable"
        return 1
    fi
}

test_help_function() {
    local script_path="$1"
    local description="$2"

    local result=0
    if "$script_path" --help 2>&1 | grep -q "DAST"; then
        log "PASS" "$description help works"
        result=0
    else
        log "FAIL" "$description help failed"
        result=1
    fi
    return $result
}

test_json_syntax() {
    local json_file="$1"
    local description="$2"

    if python3 -c "import json; json.load(open('$json_file'))" 2>/dev/null; then
        log "PASS" "$description has valid JSON syntax"
        return 0
    else
        log "FAIL" "$description has invalid JSON syntax"
        return 1
    fi
}

test_python_syntax() {
    local python_file="$1"
    local description="$2"

    if python3 -m py_compile "$python_file" 2>/dev/null; then
        log "PASS" "$description has valid Python syntax"
        return 0
    else
        log "FAIL" "$description has invalid Python syntax"
        return 1
    fi
}

echo "🚀 DAST Quick Test"
echo "=================="

all_tests_passed=0

# Test core files
test_file_exists "${SCRIPT_DIR}/dast-standalone.sh" "DAST standalone script" && all_tests_passed=1
test_file_exists "${SCRIPT_DIR}/dast-config.json.example" "Configuration template" && all_tests_passed=$((all_tests_passed && 1))
test_file_exists "${SCRIPT_DIR}/dast-defectdojo-enhanced.py" "DefectDojo enhanced uploader" && all_tests_passed=$((all_tests_passed && 1))
test_file_exists "${SCRIPT_DIR}/dast-test-framework.sh" "Test framework" && all_tests_passed=$((all_tests_passed && 1))

# Test executables
test_script_executable "${SCRIPT_DIR}/dast-standalone.sh" "DAST standalone script" && all_tests_passed=$((all_tests_passed && 1))
test_script_executable "${SCRIPT_DIR}/dast-defectdojo-enhanced.py" "DefectDojo enhanced uploader" && all_tests_passed=$((all_tests_passed && 1))
test_script_executable "${SCRIPT_DIR}/dast-test-framework.sh" "Test framework" && all_tests_passed=$((all_tests_passed && 1))

# Test help functions
test_help_function "${SCRIPT_DIR}/dast-standalone.sh" "DAST standalone script" && all_tests_passed=$((all_tests_passed && 1))
test_help_function "${SCRIPT_DIR}/dast-test-framework.sh" "Test framework" && all_tests_passed=$((all_tests_passed && 1))

# Test syntax validation
test_json_syntax "${SCRIPT_DIR}/dast-config.json.example" "Configuration template" && all_tests_passed=$((all_tests_passed && 1))
test_python_syntax "${SCRIPT_DIR}/dast-defectdojo-enhanced.py" "DefectDojo enhanced uploader" && all_tests_passed=$((all_tests_passed && 1))

# Test Docker availability (optional)
if command -v docker >/dev/null 2>&1; then
    log "PASS" "Docker is available"
    if docker info >/dev/null 2>&1; then
        log "PASS" "Docker daemon is running"
    else
        log "FAIL" "Docker daemon is not running"
    fi
else
    log "INFO" "Docker is not available (not required for quick test)"
fi

# Test Python availability
if command -v python3 >/dev/null 2>&1; then
    log "PASS" "Python3 is available"
else
    log "FAIL" "Python3 is not available"
fi

echo ""
if [[ $all_tests_passed -eq 1 ]]; then
    echo "🎉 DAST Quick Test Complete!"
    echo ""
    echo "✅ All tests passed!"
    echo ""
    echo "Next steps:"
    echo "1. Run full test suite: ./scripts/dast-test-framework.sh"
    echo "2. Create config: ./scripts/dast-standalone.sh --create-config"
    echo "3. Run first scan: ./scripts/dast-standalone.sh https://example.com"
    exit 0
else
    echo "❌ DAST Quick Test Failed!"
    echo ""
    echo "Some tests failed. Check the output above for details."
    exit 1
fi