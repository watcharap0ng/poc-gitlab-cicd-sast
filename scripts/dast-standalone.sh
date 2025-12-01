#!/bin/bash

# Test enhanced context creation
debug_setup_zap_context() {
    local target_url="$1"
    local context_name="${ZAP_CONTEXT_NAME:-dast-scan-context}"

    log "INFO" "Setting up ZAP context: $context_name"
    log "DEBUG" "Target URL: $target_url"
    log "DEBUG" "Context Name: $context_name"

    # Create context
    log "DEBUG" "Creating ZAP context with name: $context_name"
    local context_response
    context_response=$(curl -s "${ZAP_API_URL}/JSON/context/action/newContext/" \
        -d "contextName=$context_name")

    log "DEBUG" "ZAP context creation response: $context_response"

    local zap_context_id
    zap_context_id=$(echo "$context_response" | \
        python3 -c "import json, sys; print(json.load(sys.stdin).get('\''contextId'\'', ''))" 2>/dev/null)

    log "DEBUG" "Extracted context ID: '\$zap_context_id'"

    if [[ -z "$zap_context_id" ]]; then
        log "ERROR" "Failed to create ZAP context"
        log "DEBUG" "Response was: $context_response"
        return 1
    fi

    # Include target URL in context
    log "DEBUG" "Including target URL in context"
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
