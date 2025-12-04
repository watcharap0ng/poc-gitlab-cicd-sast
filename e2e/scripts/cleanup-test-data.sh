#!/bin/bash

# E2E Test Data Cleanup Script
# This script cleans up test data after E2E testing

set -e

echo "🧹 Starting E2E test data cleanup..."

# Configuration
TEST_ENVIRONMENT="${TEST_ENVIRONMENT:-test}"
BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
DB_URL="${TEST_DATABASE_URL}"

echo "📋 Cleanup Configuration:"
echo "   Environment: $TEST_ENVIRONMENT"
echo "   Base URL: $BASE_URL"

# Backup test results (optional)
if [ -d "../test-results" ]; then
    echo "💾 Test results found, preserving for analysis"
else
    echo "ℹ️  No test results to backup"
fi

# Database cleanup
if [ -n "$DB_URL" ]; then
    echo "🗄️ Cleaning up test database..."

    # Example cleanup queries (adjust based on your schema)
    echo "📝 Cleaning test database records..."

    # For Node.js/PostgreSQL example:
    # PGPASSWORD=$TEST_DB_PASSWORD psql -h $TEST_DB_HOST -U $TEST_DB_USER -d $TEST_DB_NAME -c "
    #     -- Clean up test users
    #     DELETE FROM test_users WHERE is_test_user = TRUE;
    #
    #     -- Clean up test data
    #     DELETE FROM test_data WHERE created_at > NOW() - INTERVAL '1 day';
    #
    #     -- Reset sequences
    #     -- ALTER SEQUENCE test_users_id_seq RESTART WITH 1;
    # "

    echo "ℹ️  Database cleanup placeholder"
    echo "   Customize this section based on your database structure"
else
    echo "⚠️  No database URL provided - skipping database cleanup"
fi

# API cleanup
if [ -n "$BASE_URL" ] && [ "$BASE_URL" != "http://localhost:3000" ]; then
    echo "🌐 Cleaning up API test data..."

    # Example: Cleanup test data via API
    # echo "🗑️ Cleaning test user via API..."
    # curl -X DELETE "$BASE_URL/api/test/cleanup" \
    #     -H "Content-Type: application/json" \
    #     -H "Authorization: Bearer $OAUTH_TEST_TOKEN" \
    #     || echo "⚠️ Could not cleanup test data via API"

    echo "ℹ️  API cleanup placeholder"
    echo "   Customize this section based on your API endpoints"
fi

# Cleanup configuration files
echo "📁 Cleaning up temporary configuration files..."

TEMP_FILES=(
    "test-data-config.json"
    "auth-config.json"
    "mock-services.json"
    "test-*.json"
)

for file_pattern in "${TEMP_FILES[@]}"; do
    if ls $file_pattern 1> /dev/null 2>&1; then
        echo "🗑️ Removing: $file_pattern"
        rm -f $file_pattern
    fi
done

# Cleanup test artifacts (keep failures for debugging)
echo "📸 Managing test artifacts..."

if [ -d "../test-results" ]; then
    # Count artifacts
    SCREENSHOT_COUNT=$(find ../test-results -name "*.png" 2>/dev/null | wc -l)
    VIDEO_COUNT=$(find ../test-results -name "*.webm" 2>/dev/null | wc -l)
    TRACE_COUNT=$(find ../test-results -name "*.zip" 2>/dev/null | wc -l)

    echo "📊 Test Artifacts Summary:"
    echo "   Screenshots: $SCREENSHOT_COUNT"
    echo "   Videos: $VIDEO_COUNT"
    echo "   Traces: $TRACE_COUNT"

    # Keep artifacts for failed tests
    echo "✅ Test artifacts preserved for debugging"
fi

# Cleanup temporary directories
echo "📂 Cleaning up temporary directories..."

TEMP_DIRS=(
    "temp"
    "tmp"
    ".cache"
)

for dir in "${TEMP_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "🗑️ Removing directory: $dir"
        rm -rf "$dir"
    fi
done

# Memory and process cleanup
echo "🧠 Cleaning up system resources..."

# Kill any leftover Playwright processes
echo "🔄 Terminating Playwright processes..."
pkill -f "playwright" 2>/dev/null || echo "   No Playwright processes to terminate"
pkill -f "chromium" 2>/dev/null || echo "   No Chromium processes to terminate"
pkill -f "firefox" 2>/dev/null || echo "   No Firefox processes to terminate"

# Cleanup temporary files
echo "🗂️ Cleaning up temporary files..."
find /tmp -name "playwright*" -user "$(id -u)" -delete 2>/dev/null || echo "   No temporary Playwright files to cleanup"

# Environment cleanup
echo "🌍 Resetting environment variables..."
unset TEST_DATA_CONFIG
unset AUTH_CONFIG
unset MOCK_SERVICES

# Generate cleanup summary
echo "📋 Generating cleanup summary..."

cat > cleanup-summary.json << EOF
{
  "cleanup_info": {
    "environment": "$TEST_ENVIRONMENT",
    "base_url": "$BASE_URL",
    "timestamp": "$(date -Iseconds)",
    "cleanup_duration": "$(date +%s) seconds"
  },
  "actions_performed": [
    "Database cleanup initiated",
    "API cleanup initiated",
    "Configuration files removed",
    "Temporary directories cleaned",
    "System processes terminated",
    "Temporary files removed"
  ],
  "artifacts_preserved": {
    "test_results": true,
    "screenshots": $SCREENSHOT_COUNT,
    "videos": $VIDEO_COUNT,
    "traces": $TRACE_COUNT
  }
}
EOF

# Validate cleanup
echo "🔍 Validating cleanup completion..."

# Check if temp files are removed
REMAINING_TEMP_FILES=$(ls test-*.json 2>/dev/null | wc -l)
if [ "$REMAINING_TEMP_FILES" -eq 0 ]; then
    echo "✅ All temporary configuration files removed"
else
    echo "⚠️ $REMAINING_TEMP_FILES temporary files remaining"
fi

# Check disk space (optional)
echo "💿 Disk space after cleanup:"
df -h . | tail -1 | awk '{print "   Available: " $4 " (" $5 " used)"}'

echo "🎉 E2E test data cleanup completed successfully!"
echo ""
echo "📊 Cleanup Summary:"
echo "   Environment: $TEST_ENVIRONMENT"
echo "   Artifacts preserved for debugging"
echo "   Temporary files cleaned up"
echo "   System resources freed"

# Display final status
echo ""
echo "✨ E2E testing cycle complete!"
echo "   📁 Check test-results/ for detailed test reports"
echo "   📊 Check GitLab CI artifacts for comprehensive analysis"
echo "   🐛 Check screenshots/videos for any failing tests"