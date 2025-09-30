#!/bin/bash

# GA Tech Reddit System - Fly.io Deployment Script
# Automates the deployment process to Fly.io
# Budget: Optimized for $5/month shared-cpu-1x instance

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="gatech-reddit"
REGION="atl"
FLY_CONFIG="fly.toml"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if we're logged into Fly.io
check_fly_auth() {
    if ! fly auth whoami >/dev/null 2>&1; then
        print_error "Not logged into Fly.io"
        print_status "Please run: fly auth login"
        exit 1
    fi
    print_success "Authenticated with Fly.io"
}

# Function to validate environment variables
validate_env() {
    print_status "Validating environment configuration..."

    local missing_vars=()

    # Check if .env.example exists
    if [[ ! -f ".env.example" ]]; then
        print_warning ".env.example not found - skipping environment validation"
        return 0
    fi

    # Read required variables from .env.example
    while IFS= read -r line; do
        # Skip comments and empty lines
        if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]]; then
            continue
        fi

        # Extract variable name
        if [[ "$line" =~ ^([A-Z_]+)= ]]; then
            var_name="${BASH_REMATCH[1]}"

            # Check if variable is set as a Fly secret
            if ! fly secrets list | grep -q "$var_name"; then
                missing_vars+=("$var_name")
            fi
        fi
    done < .env.example

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        print_warning "Missing secrets in Fly.io:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        print_status "Set them using: fly secrets set VARIABLE_NAME=value"
    else
        print_success "All required secrets are configured"
    fi
}

# Function to create or update the Fly.io app
setup_fly_app() {
    print_status "Setting up Fly.io application..."

    # Check if app exists
    if fly apps list | grep -q "$APP_NAME"; then
        print_success "App '$APP_NAME' already exists"
    else
        print_status "Creating new app '$APP_NAME' in region '$REGION'..."
        fly apps create "$APP_NAME" --org personal || {
            print_error "Failed to create app. The name might be taken."
            print_status "Try a different name in fly.toml"
            exit 1
        }
        print_success "App created successfully"
    fi
}

# Function to set secrets
set_secrets() {
    print_status "Configuring secrets..."

    # Check if secrets need to be set
    print_warning "Please ensure the following secrets are set:"
    echo "  fly secrets set SUPABASE_URL=your-supabase-url"
    echo "  fly secrets set SUPABASE_ANON_KEY=your-supabase-anon-key"
    echo "  fly secrets set GITHUB_CLIENT_ID=your-github-client-id"
    echo "  fly secrets set GITHUB_CLIENT_SECRET=your-github-client-secret"
    echo ""
    read -p "Have you set all required secrets? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Please set the secrets and run this script again"
        exit 1
    fi
}

# Function to build Docker image locally
build_docker_image() {
    print_status "Building Docker image locally..."

    if command_exists docker; then
        docker build -t "$APP_NAME:latest" . || {
            print_error "Docker build failed"
            exit 1
        }
        print_success "Docker image built successfully"

        # Optional: Test the image locally
        print_status "Testing Docker image locally..."
        docker run --rm -d -p 8080:8080 --name "${APP_NAME}_test" "$APP_NAME:latest"
        sleep 3

        if curl -f http://localhost:8080/health >/dev/null 2>&1; then
            print_success "Local health check passed"
        else
            print_warning "Local health check failed - continuing anyway"
        fi

        docker stop "${APP_NAME}_test" 2>/dev/null || true
    else
        print_warning "Docker not found - Fly.io will build the image"
    fi
}

# Function to deploy the application
deploy_app() {
    print_status "Deploying to Fly.io..."

    # Deploy with zero-downtime strategy
    fly deploy \
        --config "$FLY_CONFIG" \
        --strategy rolling \
        --wait-timeout 300 \
        --ha=false \
        --auto-confirm || {
        print_error "Deployment failed"
        exit 1
    }

    print_success "Deployment completed successfully"
}

# Function to check deployment status
check_deployment() {
    print_status "Checking deployment status..."

    # Get app status
    fly status --app "$APP_NAME"

    # Get recent logs
    print_status "Recent logs:"
    fly logs --app "$APP_NAME" -n 20

    # Check if app is healthy
    APP_URL="https://${APP_NAME}.fly.dev"
    print_status "Testing application at $APP_URL..."

    if curl -f "$APP_URL/health" >/dev/null 2>&1; then
        print_success "Application is healthy and running!"
        print_success "Access your app at: $APP_URL"
    else
        print_warning "Health check failed - the app might still be starting up"
        print_status "Check status with: fly status --app $APP_NAME"
        print_status "View logs with: fly logs --app $APP_NAME"
    fi
}

# Function to set up monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."

    # Display monitoring commands
    echo ""
    echo "Useful monitoring commands:"
    echo "  fly logs --app $APP_NAME           # View real-time logs"
    echo "  fly status --app $APP_NAME         # Check app status"
    echo "  fly scale show --app $APP_NAME     # View scaling configuration"
    echo "  fly vm status --app $APP_NAME      # View VM status"
    echo "  fly dashboard                      # Open Fly.io dashboard"
    echo ""
}

# Function for rollback
rollback() {
    print_warning "Rolling back to previous version..."
    fly releases --app "$APP_NAME" -n 2

    read -p "Enter the version to rollback to: " -r version
    fly deploy --image "registry.fly.io/$APP_NAME:deployment-$version" || {
        print_error "Rollback failed"
        exit 1
    }
    print_success "Rollback completed"
}

# Main deployment flow
main() {
    echo "========================================="
    echo "GA Tech Reddit System - Fly.io Deployment"
    echo "========================================="
    echo ""

    # Check prerequisites
    print_status "Checking prerequisites..."

    if ! command_exists fly; then
        print_error "Fly CLI not installed"
        print_status "Install from: https://fly.io/docs/getting-started/installing-flyctl/"
        exit 1
    fi
    print_success "Fly CLI found"

    # Check authentication
    check_fly_auth

    # Parse command line arguments
    case "${1:-deploy}" in
        deploy)
            setup_fly_app
            validate_env
            set_secrets
            build_docker_image
            deploy_app
            check_deployment
            setup_monitoring
            ;;
        rollback)
            rollback
            ;;
        status)
            fly status --app "$APP_NAME"
            ;;
        logs)
            fly logs --app "$APP_NAME"
            ;;
        secrets)
            fly secrets list --app "$APP_NAME"
            ;;
        scale)
            print_status "Current scaling configuration:"
            fly scale show --app "$APP_NAME"
            ;;
        ssh)
            fly ssh console --app "$APP_NAME"
            ;;
        destroy)
            print_warning "This will destroy the app and all its data!"
            read -p "Are you sure? Type 'yes' to confirm: " -r
            if [[ $REPLY == "yes" ]]; then
                fly apps destroy "$APP_NAME" --yes
                print_success "App destroyed"
            else
                print_status "Cancelled"
            fi
            ;;
        help|*)
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  deploy    - Deploy the application (default)"
            echo "  rollback  - Rollback to a previous version"
            echo "  status    - Show app status"
            echo "  logs      - Show recent logs"
            echo "  secrets   - List configured secrets"
            echo "  scale     - Show scaling configuration"
            echo "  ssh       - SSH into the running container"
            echo "  destroy   - Destroy the app (use with caution!)"
            echo "  help      - Show this help message"
            ;;
    esac

    echo ""
    print_success "Operation completed!"
}

# Run main function
main "$@"