#!/bin/bash

# Security Policy Check Script
# Analyzes security scan results and determines if pipeline should fail

set -e

echo "🔒 Running Security Policy Check..."

# Configuration
FAIL_ON_HIGH_CRITICAL=${FAIL_ON_HIGH_CRITICAL:-true}
FAIL_ON_MEDIUM=${FAIL_ON_MEDIUM:-false}

# Initialize counters
HIGH_CRITICAL_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0
TOTAL_FINDINGS=0

# Function to analyze JSON report for vulnerabilities
analyze_report() {
    local report_file=$1
    local tool_name=$2

    if [[ ! -f "$report_file" ]] || [[ ! -s "$report_file" ]]; then
        echo "⚠️  $tool_name report not found or empty: $report_file"
        return 0
    fi

    echo "📊 Analyzing $tool_name report..."

    # Check if file is valid JSON
    if ! python3 -c "import json; json.load(open('$report_file'))" 2>/dev/null; then
        echo "⚠️  $tool_name report is not valid JSON, skipping..."
        return 0
    fi

    # Count vulnerabilities by severity
    local high_critical=$(python3 -c "
import json, sys
try:
    with open('$report_file') as f:
        data = json.load(f)

    count = 0
    if 'Results' in data:
        for result in data['Results']:
            if 'Vulnerabilities' in result:
                for vuln in result['Vulnerabilities']:
                    if vuln.get('Severity', '').upper() in ['HIGH', 'CRITICAL']:
                        count += 1
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and 'metadata' in item:
                severity = item.get('metadata', {}).get('severity', '').upper()
                if severity in ['HIGH', 'CRITICAL']:
                    count += 1
    print(count)
except:
    print(0)
" 2>/dev/null || echo 0)

    local medium=$(python3 -c "
import json, sys
try:
    with open('$report_file') as f:
        data = json.load(f)

    count = 0
    if 'Results' in data:
        for result in data['Results']:
            if 'Vulnerabilities' in result:
                for vuln in result['Vulnerabilities']:
                    if vuln.get('Severity', '').upper() == 'MEDIUM':
                        count += 1
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and 'metadata' in item:
                severity = item.get('metadata', {}).get('severity', '').upper()
                if severity == 'MEDIUM':
                    count += 1
    print(count)
except:
    print(0)
" 2>/dev/null || echo 0)

    local low=$(python3 -c "
import json, sys
try:
    with open('$report_file') as f:
        data = json.load(f)

    count = 0
    if 'Results' in data:
        for result in data['Results']:
            if 'Vulnerabilities' in result:
                for vuln in result['Vulnerabilities']:
                    if vuln.get('Severity', '').upper() == 'LOW':
                        count += 1
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and 'metadata' in item:
                severity = item.get('metadata', {}).get('severity', '').upper()
                if severity == 'LOW':
                    count += 1
    print(count)
except:
    print(0)
" 2>/dev/null || echo 0)

    HIGH_CRITICAL_COUNT=$((HIGH_CRITICAL_COUNT + high_critical))
    MEDIUM_COUNT=$((MEDIUM_COUNT + medium))
    LOW_COUNT=$((LOW_COUNT + low))

    echo "   📋 $tool_name: HIGH/CRITICAL: $high_critical, MEDIUM: $medium, LOW: $low"

    return 0
}

# Function to analyze ZAP DAST report
analyze_zap_dast_report() {
    local report_file="gl-dast-report.json"

    if [[ ! -f "$report_file" ]] || [[ ! -s "$report_file" ]]; then
        echo "⚠️  DAST (ZAP) report not found or empty: $report_file"
        return 0
    fi

    echo "🕷️ Analyzing DAST (ZAP) results..."

    # Check if file is valid JSON
    if ! python3 -c "import json; json.load(open('$report_file'))" 2>/dev/null; then
        echo "⚠️  DAST (ZAP) report is not valid JSON, skipping..."
        return 0
    fi

    # Count ZAP findings by risk level
    local high_critical=$(python3 -c "
import json, sys
try:
    with open('$report_file') as f:
        data = json.load(f)

    count = 0
    sites = data.get('site', [])
    if isinstance(sites, list) and len(sites) > 0:
        alerts = sites[0].get('alerts', [])
        for alert in alerts:
            risk = alert.get('risk', '').upper()
            if risk in ['HIGH', 'CRITICAL']:
                count += 1
    print(count)
except:
    print(0)
" 2>/dev/null || echo 0)

    local medium=$(python3 -c "
import json, sys
try:
    with open('$report_file') as f:
        data = json.load(f)

    count = 0
    sites = data.get('site', [])
    if isinstance(sites, list) and len(sites) > 0:
        alerts = sites[0].get('alerts', [])
        for alert in alerts:
            risk = alert.get('risk', '').upper()
            if risk == 'MEDIUM':
                count += 1
    print(count)
except:
    print(0)
" 2>/dev/null || echo 0)

    local low=$(python3 -c "
import json, sys
try:
    with open('$report_file') as f:
        data = json.load(f)

    count = 0
    sites = data.get('site', [])
    if isinstance(sites, list) and len(sites) > 0:
        alerts = sites[0].get('alerts', [])
        for alert in alerts:
            risk = alert.get('risk', '').upper()
            if risk == 'LOW' or risk == 'INFORMATIONAL':
                count += 1
    print(count)
except:
    print(0)
" 2>/dev/null || echo 0)

    HIGH_CRITICAL_COUNT=$((HIGH_CRITICAL_COUNT + high_critical))
    MEDIUM_COUNT=$((MEDIUM_COUNT + medium))
    LOW_COUNT=$((LOW_COUNT + low))

    echo "   🕷️ DAST (ZAP): HIGH/CRITICAL: $high_critical, MEDIUM: $medium, LOW: $low"

    # Store DAST-specific results for summary
    cat > dast_summary.json << EOF
{
  "dast": {
    "high_critical_findings": $high_critical,
    "medium_findings": $medium,
    "low_findings": $low,
    "total_findings": $((high_critical + medium + low)),
    "tool": "OWASP ZAP",
    "scan_timestamp": "$(date -Iseconds)"
  }
}
EOF

    return 0
}

# Analyze all security reports
echo "🔍 Analyzing security scan results..."

analyze_report "gitleaks.json" "Gitleaks"
analyze_report "semgrep.json" "Semgrep"
analyze_report "trivy_fs_report.json" "Trivy FS"
analyze_report "trivy_images_report.json" "Trivy Docker"
analyze_report "dependency_track_findings.json" "Dependency Track"

# Note: DAST analysis happens after deployment, so this is for reporting only
# The actual policy enforcement for DAST would need to be handled separately
# since DAST runs after the security policy check stage
analyze_zap_dast_report

TOTAL_FINDINGS=$((HIGH_CRITICAL_COUNT + MEDIUM_COUNT + LOW_COUNT))

echo ""
echo "📊 Security Summary:"
echo "   🔴 HIGH/CRITICAL: $HIGH_CRITICAL_COUNT"
echo "   🟡 MEDIUM: $MEDIUM_COUNT"
echo "   🟢 LOW: $LOW_COUNT"
echo "   📈 Total Findings: $TOTAL_FINDINGS"

# Create security summary report
cat > security_summary.json << EOF
{
  "scan_summary": {
    "high_critical_vulnerabilities": $HIGH_CRITICAL_COUNT,
    "medium_vulnerabilities": $MEDIUM_COUNT,
    "low_vulnerabilities": $LOW_COUNT,
    "total_findings": $TOTAL_FINDINGS,
    "scan_timestamp": "$(date -Iseconds)",
    "commit_sha": "$CI_COMMIT_SHA",
    "branch": "$CI_COMMIT_REF_NAME"
  },
  "policy_config": {
    "fail_on_high_critical": $FAIL_ON_HIGH_CRITICAL,
    "fail_on_medium": $FAIL_ON_MEDIUM
  }
}
EOF

echo ""
echo "🔒 Security Policy Check Results:"
echo "   Fail on HIGH/CRITICAL: $FAIL_ON_HIGH_CRITICAL"
echo "   Fail on MEDIUM: $FAIL_ON_MEDIUM"

# Determine if pipeline should fail
PIPELINE_SHOULD_FAIL=false

if [[ "$FAIL_ON_HIGH_CRITICAL" == "true" ]] && [[ $HIGH_CRITICAL_COUNT -gt 0 ]]; then
    echo "   ❌ PIPELINE WILL FAIL: Found $HIGH_CRITICAL_COUNT HIGH/CRITICAL vulnerabilities"
    PIPELINE_SHOULD_FAIL=true
fi

if [[ "$FAIL_ON_MEDIUM" == "true" ]] && [[ $MEDIUM_COUNT -gt 0 ]]; then
    echo "   ❌ PIPELINE WILL FAIL: Found $MEDIUM_COUNT MEDIUM vulnerabilities"
    PIPELINE_SHOULD_FAIL=true
fi

if [[ "$PIPELINE_SHOULD_FAIL" == "false" ]]; then
    echo "   ✅ PIPELINE WILL CONTINUE: No policy violations detected"
fi

echo ""
echo "📄 Security summary saved to security_summary.json"

# Exit with appropriate code
if [[ "$PIPELINE_SHOULD_FAIL" == "true" ]]; then
    echo "❌ Security policy check FAILED"
    exit 1
else
    echo "✅ Security policy check PASSED"
    exit 0
fi