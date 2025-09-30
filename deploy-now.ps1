# GA Tech Reddit - Deploy to Fly.io
# Run this script: .\deploy-now.ps1

Write-Host "🚀 GA Tech Reddit - Fly.io Deployment" -ForegroundColor Cyan
Write-Host ""

# Set the token
$env:FLY_API_TOKEN = "FlyV1 fm2_lJPECAAAAAAACPvmxBDcTAURyD8/fErXoi1M30x7wrVodHRwczovL2FwaS5mbHkuaW8vdjGWAJLOABELjR8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxZL2utR1rB8goBbJ9kL8cuBJE/8YZY+JT1CUf8K70P/rfZ4/7fwZs/qeK62qwjUxLHR8EwbA7uiaD4GvLETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ==,fm2_lJPETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ=="

Write-Host "✅ Token configured" -ForegroundColor Green

# Change to project directory
Set-Location "C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system"

# Check if flyctl is available
Write-Host "🔍 Checking Fly CLI..." -ForegroundColor Yellow
try {
    & flyctl version
    Write-Host "✅ Fly CLI found!" -ForegroundColor Green
} catch {
    Write-Host "❌ Fly CLI not found. Installing..." -ForegroundColor Red
    iwr https://fly.io/install.ps1 -useb | iex
    Write-Host "✅ Fly CLI installed! Please close and reopen PowerShell, then run this script again." -ForegroundColor Green
    exit
}

Write-Host ""
Write-Host "📋 Step 1: Checking existing apps..." -ForegroundColor Cyan
& flyctl apps list

Write-Host ""
Write-Host "🎯 Step 2: Creating app 'gatech-reddit'..." -ForegroundColor Cyan
& flyctl apps create gatech-reddit --org personal

Write-Host ""
Write-Host "⚠️  IMPORTANT: Before deploying, you need to:" -ForegroundColor Yellow
Write-Host "   1. Create Supabase project at https://supabase.com" -ForegroundColor White
Write-Host "   2. Run database-schema.sql in SQL Editor" -ForegroundColor White
Write-Host "   3. Set up GitHub OAuth" -ForegroundColor White
Write-Host ""
Write-Host "   Once done, run these commands:" -ForegroundColor White
Write-Host '   flyctl secrets set SUPABASE_URL="https://YOUR_PROJECT.supabase.co"' -ForegroundColor Gray
Write-Host '   flyctl secrets set SUPABASE_ANON_KEY="your_anon_key_here"' -ForegroundColor Gray
Write-Host '   flyctl secrets set GITHUB_CLIENT_ID="your_github_client_id"' -ForegroundColor Gray
Write-Host '   flyctl secrets set GITHUB_CLIENT_SECRET="your_github_secret"' -ForegroundColor Gray
Write-Host ""

$response = Read-Host "Have you completed Supabase setup and want to set secrets now? (y/n)"

if ($response -eq 'y') {
    Write-Host ""
    Write-Host "📝 Enter your Supabase credentials:" -ForegroundColor Cyan

    $supabaseUrl = Read-Host "Supabase URL (https://xxxxx.supabase.co)"
    $supabaseKey = Read-Host "Supabase Anon Key"
    $githubId = Read-Host "GitHub Client ID"
    $githubSecret = Read-Host "GitHub Client Secret"

    Write-Host ""
    Write-Host "🔐 Setting secrets..." -ForegroundColor Yellow

    & flyctl secrets set "SUPABASE_URL=$supabaseUrl"
    & flyctl secrets set "SUPABASE_ANON_KEY=$supabaseKey"
    & flyctl secrets set "GITHUB_CLIENT_ID=$githubId"
    & flyctl secrets set "GITHUB_CLIENT_SECRET=$githubSecret"

    Write-Host "✅ Secrets configured!" -ForegroundColor Green
    Write-Host ""

    $deploy = Read-Host "Ready to deploy? (y/n)"

    if ($deploy -eq 'y') {
        Write-Host ""
        Write-Host "🚀 Deploying to Fly.io..." -ForegroundColor Cyan
        & flyctl deploy --region atl

        Write-Host ""
        Write-Host "🎉 Deployment complete!" -ForegroundColor Green
        Write-Host "Opening your app..." -ForegroundColor Cyan
        & flyctl open
    } else {
        Write-Host ""
        Write-Host "👍 No problem! When ready, run:" -ForegroundColor Yellow
        Write-Host "   flyctl deploy --region atl" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "👍 No problem! Follow the QUICK_DEPLOY.md guide to set up Supabase first." -ForegroundColor Yellow
    Write-Host "   Then come back and run this script again!" -ForegroundColor White
}

Write-Host ""
Write-Host "📚 Useful commands:" -ForegroundColor Cyan
Write-Host "   flyctl status        - Check app status" -ForegroundColor White
Write-Host "   flyctl logs          - View logs" -ForegroundColor White
Write-Host "   flyctl open          - Open app in browser" -ForegroundColor White
Write-Host "   flyctl ssh console   - SSH into container" -ForegroundColor White
