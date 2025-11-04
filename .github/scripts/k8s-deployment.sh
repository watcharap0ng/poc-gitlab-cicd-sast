#!/bin/bash

# Enhanced Kubernetes Deployment Script for GitHub Actions
# Supports multiple environments, canary deployments, and security validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
KUBERNETES_DIR="$PROJECT_ROOT/.github/kubernetes"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS: $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

log_error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
}

# Function to display usage
usage() {
    cat << EOF
Enhanced Kubernetes Deployment Script

Usage: $0 [OPTIONS]

OPTIONS:
    -e, --environment ENV     Deployment environment (staging|production) [required]
    -i, --image IMAGE        Docker image to deploy [required]
    -n, --namespace NS       Kubernetes namespace [default: secure-app]
    -c, --config FILE        Kubeconfig file [default: ~/.kube/config]
    -m, --manifests PATH     Path to manifests [default: .github/kubernetes]
    -t, --timeout SECONDS    Deployment timeout [default: 300]
    -r, --rollback           Enable rollback on failure
    --canary                 Enable canary deployment
    --canary-percent PCT     Canary traffic percentage [default: 10]
    --dry-run                Show what would be deployed without actually deploying
    --skip-validation        Skip security validation
    -h, --help               Show this help message

EXAMPLES:
    $0 --environment production --image ghcr.io/myorg/app:sha-123456
    $0 --environment staging --image myapp:latest --canary --canary-percent 20
    $0 --environment production --image myapp:v1.0 --rollback --dry-run

EOF
}

# Function to validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."

    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    # Check if kubeconfig exists
    if [[ ! -f "$KUBECONFIG" && ! -f "$HOME/.kube/config" ]]; then
        log_error "No kubeconfig found"
        exit 1
    fi

    # Check if we can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check if manifests directory exists
    if [[ ! -d "$MANIFESTS_PATH" ]]; then
        log_error "Manifests directory not found: $MANIFESTS_PATH"
        exit 1
    fi

    log_success "Prerequisites validation passed"
}

# Function to validate environment
validate_environment() {
    log_info "Validating environment configuration..."

    case "$ENVIRONMENT" in
        staging|production)
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT (must be staging or production)"
            exit 1
            ;;
    esac

    # Validate image format
    if [[ ! "$IMAGE" =~ ^[a-z0-9._-]+/[a-z0-9._-]+:[a-zA-Z0-9._-]+$ ]]; then
        log_error "Invalid image format: $IMAGE"
        exit 1
    fi

    log_success "Environment validation passed"
}

# Function to setup namespace
setup_namespace() {
    log_info "Setting up namespace: $NAMESPACE"

    # Create namespace if it doesn't exist
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl create namespace "$NAMESPACE"
        log_success "Created namespace: $NAMESPACE"
    else
        log_info "Namespace already exists: $NAMESPACE"
    fi

    # Add labels to namespace
    kubectl label namespace "$NAMESPACE" \
        name="$NAMESPACE" \
        environment="$ENVIRONMENT" \
        managed-by="github-actions" \
        security-level="high" \
        --overwrite
}

# Function to perform security validation
validate_security() {
    if [[ "$SKIP_VALIDATION" == "true" ]]; then
        log_warning "Skipping security validation"
        return
    fi

    log_info "Performing security validation..."

    local validation_failed=false

    # Check network policies
    if ! kubectl get networkpolicy -n "$NAMESPACE" | grep -q "secure-nodejs-app"; then
        log_warning "No network policies found"
        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Network policies required for production"
            validation_failed=true
        fi
    fi

    # Check resource limits
    if ! kubectl get limitrange -n "$NAMESPACE" | grep -q "secure-app-limits"; then
        log_warning "No resource limits configured"
        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Resource limits required for production"
            validation_failed=true
        fi
    fi

    # Check pod security policies
    if ! kubectl get podsecuritypolicy 2>/dev/null | grep -q "secure"; then
        log_warning "No pod security policies found"
    fi

    # Check RBAC
    if ! kubectl get rolebinding -n "$NAMESPACE" | grep -q "secure-nodejs-app"; then
        log_warning "No RBAC configuration found"
    fi

    if [[ "$validation_failed" == "true" ]]; then
        log_error "Security validation failed"
        exit 1
    fi

    log_success "Security validation passed"
}

# Function to validate manifests
validate_manifests() {
    log_info "Validating Kubernetes manifests..."

    local manifest_files=("$MANIFESTS_PATH"/*.yaml)
    for manifest in "${manifest_files[@]}"; do
        if [[ -f "$manifest" ]]; then
            log_info "Validating $manifest..."

            if ! kubectl --dry-run=client apply -f "$manifest"; then
                log_error "Manifest validation failed: $manifest"
                exit 1
            fi
        fi
    done

    log_success "All manifests validated successfully"
}

# Function to get current deployment state
get_current_state() {
    log_info "Getting current deployment state..."

    if kubectl get deployment secure-nodejs-app -n "$NAMESPACE" &> /dev/null; then
        CURRENT_REVISION=$(kubectl get deployment secure-nodejs-app -n "$NAMESPACE" -o jsonpath='{.status.observedGeneration}')
        CURRENT_REPLICAS=$(kubectl get deployment secure-nodejs-app -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
        CURRENT_IMAGE=$(kubectl get deployment secure-nodejs-app -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}')

        log_info "Current state:"
        log_info "  Revision: $CURRENT_REVISION"
        log_info "  Replicas: $CURRENT_REPLICAS"
        log_info "  Image: $CURRENT_IMAGE"
    else
        log_info "No existing deployment found"
        CURRENT_REVISION="0"
        CURRENT_REPLICAS="0"
        CURRENT_IMAGE=""
    fi
}

# Function to deploy application
deploy_application() {
    log_info "Starting deployment to $ENVIRONMENT..."

    # Prepare environment variables for templating
    export GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-unknown}"
    export GITHUB_SHA="${GITHUB_SHA:-unknown}"
    export GITHUB_RUN_ID="${GITHUB_RUN_ID:-unknown}"
    export ENVIRONMENT="$ENVIRONMENT"
    export NAMESPACE="$NAMESPACE"
    export IMAGE="$IMAGE"

    # Create temporary deployment file
    local temp_deployment=$(mktemp)
    trap "rm -f $temp_deployment" EXIT

    # Template the deployment manifest
    envsubst < "$MANIFESTS_PATH/deployment.yaml" > "$temp_deployment"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would deploy with image $IMAGE"
        kubectl --dry-run=server apply -f "$temp_deployment" -n "$NAMESPACE"
        return
    fi

    # Apply security manifests first
    if [[ -f "$MANIFESTS_PATH/security.yaml" ]]; then
        log_info "Applying security manifests..."
        kubectl apply -f "$MANIFESTS_PATH/security.yaml"
    fi

    # Apply deployment
    log_info "Applying deployment manifest..."
    if ! kubectl apply -f "$temp_deployment" -n "$NAMESPACE"; then
        log_error "Failed to apply deployment manifest"
        exit 1
    fi

    log_success "Deployment manifest applied"
}

# Function to wait for deployment
wait_for_deployment() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would wait for deployment rollout"
        return
    fi

    log_info "Waiting for deployment rollout (timeout: ${TIMEOUT}s)..."

    if ! kubectl rollout status deployment/secure-nodejs-app \
        -n "$NAMESPACE" \
        --timeout="${TIMEOUT}s"; then
        log_error "Deployment rollout failed or timed out"

        if [[ "$ENABLE_ROLLBACK" == "true" ]]; then
            log_info "Initiating automatic rollback..."
            kubectl rollout undo deployment/secure-nodejs-app -n "$NAMESPACE"
            log_success "Rollback completed"
        fi

        exit 1
    fi

    log_success "Deployment rollout completed successfully"
}

# Function to perform post-deployment validation
post_deployment_validation() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would perform post-deployment validation"
        return
    fi

    log_info "Performing post-deployment validation..."

    # Check pod readiness
    if ! kubectl wait --for=condition=Ready pod \
        -l app=secure-nodejs-app \
        -n "$NAMESPACE" \
        --timeout=60s; then
        log_error "Pods are not ready"
        exit 1
    fi

    # Check service endpoints
    if ! kubectl get endpoints secure-nodejs-app-service -n "$NAMESPACE" &> /dev/null; then
        log_error "Service endpoints not available"
        exit 1
    fi

    log_success "Post-deployment validation passed"
}

# Function to perform health check
health_check() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would perform health check"
        return
    fi

    log_info "Performing application health check..."

    # Get service URL
    local service_url
    service_url=$(get_service_url)

    log_info "Service URL: $service_url"

    # Perform health check with retries
    local max_attempts=30
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "$service_url/health" &> /dev/null; then
            log_success "Health check passed"
            return
        fi

        log_info "Waiting for application to be healthy... ($attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done

    log_error "Health check failed after $max_attempts attempts"

    if [[ "$ENABLE_ROLLBACK" == "true" ]]; then
        log_info "Rolling back due to health check failure..."
        kubectl rollout undo deployment/secure-nodejs-app -n "$NAMESPACE"
    fi

    exit 1
}

# Function to get service URL
get_service_url() {
    local service_ip service_hostname service_url

    service_ip=$(kubectl get service secure-nodejs-app-service -n "$NAMESPACE" \
        -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    service_hostname=$(kubectl get service secure-nodejs-app-service -n "$NAMESPACE" \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)

    if [[ -n "$service_ip" ]]; then
        service_url="http://$service_ip"
    elif [[ -n "$service_hostname" ]]; then
        service_url="http://$service_hostname"
    else
        # For local development
        service_url="http://localhost:30000"
    fi

    echo "$service_url"
}

# Function to setup canary deployment
setup_canary() {
    if [[ "$ENABLE_CANARY" != "true" ]]; then
        return
    fi

    log_info "Setting up canary deployment (${CANARY_PERCENT}% traffic)..."

    # This is a simplified canary setup
    # In production, you might use Argo Rollouts or Istio for proper canary
    local canary_deployment
    canary_deployment=$(cat << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-nodejs-app-canary
  namespace: $NAMESPACE
  labels:
    app: secure-nodejs-app-canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secure-nodejs-app-canary
  template:
    metadata:
      labels:
        app: secure-nodejs-app-canary
    spec:
      containers:
      - name: secure-nodejs-app
        image: $IMAGE
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "$ENVIRONMENT"
        - name: CANARY
          value: "true"
EOF
    )

    if [[ "$DRY_RUN" != "true" ]]; then
        echo "$canary_deployment" | kubectl apply -f -
        log_success "Canary deployment configured"
    else
        log_info "DRY RUN: Would setup canary deployment"
    fi
}

# Function to generate deployment summary
generate_summary() {
    log_info "Deployment Summary"
    log_info "=================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "Image: $IMAGE"
    log_info "Status: success"
    log_info "Service URL: $(get_service_url)"
    echo

    log_info "Deployment Details:"
    kubectl get deployment secure-nodejs-app -n "$NAMESPACE" -o wide
    echo

    log_info "Pod Status:"
    kubectl get pods -l app=secure-nodejs-app -n "$NAMESPACE"
    echo

    log_info "Service Status:"
    kubectl get service secure-nodejs-app-service -n "$NAMESPACE"
}

# Default values
ENVIRONMENT=""
IMAGE=""
NAMESPACE="secure-app"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
MANIFESTS_PATH="$KUBERNETES_DIR"
TIMEOUT="300"
ENABLE_ROLLBACK="false"
ENABLE_CANARY="false"
CANARY_PERCENT="10"
DRY_RUN="false"
SKIP_VALIDATION="false"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -i|--image)
            IMAGE="$2"
            shift 2
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -c|--config)
            KUBECONFIG="$2"
            shift 2
            ;;
        -m|--manifests)
            MANIFESTS_PATH="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -r|--rollback)
            ENABLE_ROLLBACK="true"
            shift
            ;;
        --canary)
            ENABLE_CANARY="true"
            shift
            ;;
        --canary-percent)
            CANARY_PERCENT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --skip-validation)
            SKIP_VALIDATION="true"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$ENVIRONMENT" || -z "$IMAGE" ]]; then
    log_error "Environment and image are required"
    usage
    exit 1
fi

# Main execution
main() {
    log_info "Starting enhanced Kubernetes deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Image: $IMAGE"
    log_info "Namespace: $NAMESPACE"

    validate_prerequisites
    validate_environment
    setup_namespace

    if [[ "$DRY_RUN" != "true" ]]; then
        validate_security
    fi

    validate_manifests
    get_current_state
    deploy_application
    wait_for_deployment
    post_deployment_validation
    health_check
    setup_canary
    generate_summary

    log_success "Deployment completed successfully!"
}

# Execute main function
main "$@"