# GA Tech Reddit System - Fly.io Deployment Script (PowerShell/Windows)
# Automates the deployment process to Fly.io on Windows
# Budget: Optimized for $5/month shared-cpu-1x instance

param(
    [Parameter(Position=0)]
    [ValidateSet("deploy", "rollback", "status", "logs", "secrets", "scale", "ssh", "destroy", "help")]
    [string]$Command = "deploy"
)

# Configuration
$APP_NAME = "gatech-reddit"
$REGION = "atl"
$FLY_CONFIG = "fly.toml"

# Color functions for output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

# Function to check if command exists
function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Function to check Fly.io authentication
function Test-FlyAuth {
    try {
        $result = fly auth whoami 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Not logged into Fly.io"
            Write-Status "Please run: fly auth login"
            exit 1
        }
        Write-Success "Authenticated with Fly.io"
    }
    catch {
        Write-Error "Failed to check Fly.io authentication"
        exit 1
    }
}

# Function to validate environment variables
function Test-Environment {
    Write-Status "Validating environment configuration..."

    if (-not (Test-Path ".env.example")) {
        Write-Warning ".env.example not found - skipping environment validation"
        return
    }

    $missingVars = @()
    $envContent = Get-Content ".env.example"
    $secrets = fly secrets list 2>$null

    foreach ($line in $envContent) {
        if ($line -match '^([A-Z_]+)=') {
            $varName = $matches[1]
            if ($secrets -notmatch $varName) {
                $missingVars += $varName
            }
        }
    }

    if ($missingVars.Count -gt 0) {
        Write-Warning "Missing secrets in Fly.io:"
        foreach ($var in $missingVars) {
            Write-Host "  - $var"
        }
        Write-Status "Set them using: fly secrets set VARIABLE_NAME=value"
    }
    else {
        Write-Success "All required secrets are configured"
    }
}

# Function to setup Fly.io app
function Initialize-FlyApp {
    Write-Status "Setting up Fly.io application..."

    $apps = fly apps list 2>$null
    if ($apps -match $APP_NAME) {
        Write-Success "App '$APP_NAME' already exists"
    }
    else {
        Write-Status "Creating new app '$APP_NAME' in region '$REGION'..."
        fly apps create $APP_NAME --org personal
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create app. The name might be taken."
            Write-Status "Try a different name in fly.toml"
            exit 1
        }
        Write-Success "App created successfully"
    }
}

# Function to set secrets
function Set-FlySecrets {
    Write-Status "Configuring secrets..."

    Write-Warning "Please ensure the following secrets are set:"
    Write-Host "  fly secrets set SUPABASE_URL=your-supabase-url"
    Write-Host "  fly secrets set SUPABASE_ANON_KEY=your-supabase-anon-key"
    Write-Host "  fly secrets set GITHUB_CLIENT_ID=your-github-client-id"
    Write-Host "  fly secrets set GITHUB_CLIENT_SECRET=your-github-client-secret"
    Write-Host ""

    $response = Read-Host "Have you set all required secrets? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Status "Please set the secrets and run this script again"
        exit 1
    }
}

# Function to build Docker image
function Build-DockerImage {
    Write-Status "Building Docker image locally..."

    if (Test-Command "docker") {
        docker build -t "${APP_NAME}:latest" .
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Docker build failed"
            exit 1
        }
        Write-Success "Docker image built successfully"

        # Test the image locally
        Write-Status "Testing Docker image locally..."
        docker run --rm -d -p 8080:8080 --name "${APP_NAME}_test" "${APP_NAME}:latest"
        Start-Sleep -Seconds 3

        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Success "Local health check passed"
            }
        }
        catch {
            Write-Warning "Local health check failed - continuing anyway"
        }

        docker stop "${APP_NAME}_test" 2>$null
    }
    else {
        Write-Warning "Docker not found - Fly.io will build the image"
    }
}

# Function to deploy the application
function Deploy-App {
    Write-Status "Deploying to Fly.io..."

    fly deploy `
        --config $FLY_CONFIG `
        --strategy rolling `
        --wait-timeout 300 `
        --ha=false `
        --auto-confirm

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Deployment failed"
        exit 1
    }

    Write-Success "Deployment completed successfully"
}

# Function to check deployment status
function Test-Deployment {
    Write-Status "Checking deployment status..."

    # Get app status
    fly status --app $APP_NAME

    # Get recent logs
    Write-Status "Recent logs:"
    fly logs --app $APP_NAME -n 20

    # Check if app is healthy
    $appUrl = "https://${APP_NAME}.fly.dev"
    Write-Status "Testing application at $appUrl..."

    try {
        $response = Invoke-WebRequest -Uri "$appUrl/health" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Success "Application is healthy and running!"
            Write-Success "Access your app at: $appUrl"
        }
    }
    catch {
        Write-Warning "Health check failed - the app might still be starting up"
        Write-Status "Check status with: fly status --app $APP_NAME"
        Write-Status "View logs with: fly logs --app $APP_NAME"
    }
}

# Function to setup monitoring
function Initialize-Monitoring {
    Write-Status "Setting up monitoring..."

    Write-Host ""
    Write-Host "Useful monitoring commands:"
    Write-Host "  fly logs --app $APP_NAME           # View real-time logs"
    Write-Host "  fly status --app $APP_NAME         # Check app status"
    Write-Host "  fly scale show --app $APP_NAME     # View scaling configuration"
    Write-Host "  fly vm status --app $APP_NAME      # View VM status"
    Write-Host "  fly dashboard                      # Open Fly.io dashboard"
    Write-Host ""
}

# Function for rollback
function Invoke-Rollback {
    Write-Warning "Rolling back to previous version..."
    fly releases --app $APP_NAME -n 2

    $version = Read-Host "Enter the version to rollback to"
    fly deploy --image "registry.fly.io/${APP_NAME}:deployment-${version}"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Rollback failed"
        exit 1
    }
    Write-Success "Rollback completed"
}

# Main function
function Main {
    Write-Host "========================================="
    Write-Host "GA Tech Reddit System - Fly.io Deployment"
    Write-Host "========================================="
    Write-Host ""

    # Check prerequisites
    Write-Status "Checking prerequisites..."

    if (-not (Test-Command "fly")) {
        Write-Error "Fly CLI not installed"
        Write-Status "Install from: https://fly.io/docs/getting-started/installing-flyctl/"
        Write-Status "Or use: iwr https://fly.io/install.ps1 -useb | iex"
        exit 1
    }
    Write-Success "Fly CLI found"

    # Check authentication
    Test-FlyAuth

    # Execute command
    switch ($Command) {
        "deploy" {
            Initialize-FlyApp
            Test-Environment
            Set-FlySecrets
            Build-DockerImage
            Deploy-App
            Test-Deployment
            Initialize-Monitoring
        }
        "rollback" {
            Invoke-Rollback
        }
        "status" {
            fly status --app $APP_NAME
        }
        "logs" {
            fly logs --app $APP_NAME
        }
        "secrets" {
            fly secrets list --app $APP_NAME
        }
        "scale" {
            Write-Status "Current scaling configuration:"
            fly scale show --app $APP_NAME
        }
        "ssh" {
            fly ssh console --app $APP_NAME
        }
        "destroy" {
            Write-Warning "This will destroy the app and all its data!"
            $response = Read-Host "Are you sure? Type 'yes' to confirm"
            if ($response -eq "yes") {
                fly apps destroy $APP_NAME --yes
                Write-Success "App destroyed"
            }
            else {
                Write-Status "Cancelled"
            }
        }
        default {
            Write-Host "Usage: .\deploy.ps1 [command]"
            Write-Host ""
            Write-Host "Commands:"
            Write-Host "  deploy    - Deploy the application (default)"
            Write-Host "  rollback  - Rollback to a previous version"
            Write-Host "  status    - Show app status"
            Write-Host "  logs      - Show recent logs"
            Write-Host "  secrets   - List configured secrets"
            Write-Host "  scale     - Show scaling configuration"
            Write-Host "  ssh       - SSH into the running container"
            Write-Host "  destroy   - Destroy the app (use with caution!)"
            Write-Host "  help      - Show this help message"
        }
    }

    Write-Host ""
    Write-Success "Operation completed!"
}

# Run main function
Main