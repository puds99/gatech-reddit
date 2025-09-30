# Auto Deploy GA Tech Reddit to Fly.io
$ErrorActionPreference = "Stop"

Write-Host "Deploying GA Tech Reddit to Fly.io..." -ForegroundColor Cyan

# Set token
$env:FLY_API_TOKEN = "FlyV1 fm2_lJPECAAAAAAACPvmxBDcTAURyD8/fErXoi1M30x7wrVodHRwczovL2FwaS5mbHkuaW8vdjGWAJLOABELjR8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxZL2utR1rB8goBbJ9kL8cuBJE/8YZY+JT1CUf8K70P/rfZ4/7fwZs/qeK62qwjUxLHR8EwbA7uiaD4GvLETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ==,fm2_lJPETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ=="

Set-Location "C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system"

# Create app
Write-Host "Creating Fly.io app..." -ForegroundColor Yellow
flyctl apps create gatech-reddit --org personal 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "App might already exist, continuing..." -ForegroundColor Gray
}

# Deploy
Write-Host "Deploying to atl region..." -ForegroundColor Yellow
flyctl deploy --region atl --now

Write-Host "Done! Opening app..." -ForegroundColor Green
flyctl open
