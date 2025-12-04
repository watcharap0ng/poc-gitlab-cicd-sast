#!/bin/bash

# E2E Test Data Setup Script
# This script prepares the test environment for E2E testing

set -e

echo "🔧 Starting E2E test data setup..."

# Configuration
TEST_ENVIRONMENT="${TEST_ENVIRONMENT:-test}"
BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
DB_URL="${TEST_DATABASE_URL}"

echo "📋 Test Configuration:"
echo "   Environment: $TEST_ENVIRONMENT"
echo "   Base URL: $BASE_URL"
echo "   Database: ${DB_URL:0:20}..."

# Create test configuration file
cat > test-data-config.json << EOF
{
  "environment": "$TEST_ENVIRONMENT",
  "base_url": "$BASE_URL",
  "timestamp": "$(date -Iseconds)",
  "test_data": {
    "users": [
      {
        "username": "${TEST_USER_USERNAME:-testuser@example.com}",
        "password": "${TEST_USER_PASSWORD:-testpassword123}",
        "role": "test_user"
      }
    ],
    "sample_data": {
      "title": "E2E Test Sample",
      "description": "Sample data for E2E testing",
      "created_at": "$(date -Iseconds)"
    }
  }
}
EOF

echo "✅ Test configuration created"

# Database setup (if database URL is provided)
if [ -n "$DB_URL" ]; then
    echo "🗄️ Setting up test database..."

    # Create test tables (example - adjust based on your schema)
    echo "📝 Creating test database schema..."

    # For Node.js/PostgreSQL example:
    # PGPASSWORD=$TEST_DB_PASSWORD psql -h $TEST_DB_HOST -U $TEST_DB_USER -d $TEST_DB_NAME -c "
    #     -- Create test users table if not exists
    #     CREATE TABLE IF NOT EXISTS test_users (
    #         id SERIAL PRIMARY KEY,
    #         username VARCHAR(255) UNIQUE NOT NULL,
    #         email VARCHAR(255) UNIQUE NOT NULL,
    #         password_hash VARCHAR(255) NOT NULL,
    #         role VARCHAR(50) DEFAULT 'user',
    #         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    #         is_test_user BOOLEAN DEFAULT TRUE
    #     );
    # "

    echo "ℹ️  Database schema setup placeholder"
    echo "   Customize this section based on your database structure"
else
    echo "⚠️  No database URL provided - skipping database setup"
fi

# API Test Data Setup (if API is available)
if [ -n "$BASE_URL" ] && [ "$BASE_URL" != "http://localhost:3000" ]; then
    echo "🌐 Setting up API test data..."

    # Wait for API to be ready
    echo "⏳ Checking API availability..."
    for i in {1..30}; do
        if curl -f -s "$BASE_URL/health" >/dev/null 2>&1; then
            echo "✅ API is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "⚠️ API not responding, proceeding with setup"
        fi
        sleep 2
    done

    # Example: Create test user via API (adjust based on your API)
    # echo "👤 Creating test user via API..."
    # curl -X POST "$BASE_URL/api/test/setup" \
    #     -H "Content-Type: application/json" \
    #     -d @test-data-config.json \
    #     || echo "⚠️ Could not create test user via API"

    echo "ℹ️  API test data setup placeholder"
    echo "   Customize this section based on your API endpoints"
fi

# Authentication tokens setup
if [ -n "$OAUTH_TEST_TOKEN" ]; then
    echo "🔑 Setting up OAuth test token..."
    echo "   Token configured: ${OAUTH_TEST_TOKEN:0:20}..."

    # Save token for tests
    cat > auth-config.json << EOF
{
  "oauth": {
    "token": "$OAUTH_TEST_TOKEN",
    "type": "Bearer",
    "expires_at": "$(date -d '+1 hour' -Iseconds)"
  }
}
EOF
    echo "✅ OAuth token configuration saved"
else
    echo "⚠️  No OAuth test token provided"
fi

# External service mocking setup
echo "🎭 Setting up external service mocks..."
cat > mock-services.json << EOF
{
  "mocks": {
    "email_service": {
      "enabled": true,
      "endpoint": "$BASE_URL/mock/email",
      "responses": {
        "send": {"status": "success", "message": "Email queued"}
      }
    },
    "payment_gateway": {
      "enabled": true,
      "endpoint": "$BASE_URL/mock/payment",
      "responses": {
        "charge": {"status": "success", "transaction_id": "test_txn_123"}
      }
    },
    "analytics": {
      "enabled": true,
      "endpoint": "$BASE_URL/mock/analytics",
      "responses": {
        "track": {"status": "success"}
      }
    }
  }
}
EOF
echo "✅ Mock services configuration created"

# Test environment validation
echo "🔍 Validating test environment..."

# Check if required files exist
REQUIRED_FILES=("test-data-config.json")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file is missing"
        exit 1
    fi
done

# Validate configuration
if [ -n "$BASE_URL" ]; then
    echo "✅ Base URL configured: $BASE_URL"
else
    echo "❌ Base URL not configured"
    exit 1
fi

# Test environment health check
echo "🏥 Performing test environment health check..."

# Application health check
if [ -n "$BASE_URL" ]; then
    echo "🌐 Checking application health..."
    if curl -f -s --max-time 10 "$BASE_URL" >/dev/null 2>&1; then
        echo "✅ Application is responding"
    else
        echo "⚠️ Application is not responding - tests may fail"
    fi
fi

echo "🎉 E2E test data setup completed successfully!"
echo "📁 Generated files:"
ls -la *.json 2>/dev/null | sed 's/^/   • /' || echo "   No JSON files generated"

echo ""
echo "🚀 Ready to run E2E tests!"
echo "   Environment: $TEST_ENVIRONMENT"
echo "   Base URL: $BASE_URL"
echo "   Configuration files created and ready"