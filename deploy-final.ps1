# GA Tech Reddit Deploy
$fly = "C:\Users\Jim\.fly\bin\flyctl.exe"
$env:FLY_API_TOKEN = "FlyV1 fm2_lJPECAAAAAAACPvmxBDcTAURyD8/fErXoi1M30x7wrVodHRwczovL2FwaS5mbHkuaW8vdjGWAJLOABELjR8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxZL2utR1rB8goBbJ9kL8cuBJE/8YZY+JT1CUf8K70P/rfZ4/7fwZs/qeK62qwjUxLHR8EwbA7uiaD4GvLETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ==,fm2_lJPETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ=="

cd "C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system"

Write-Host "Creating gatech-reddit app..." -ForegroundColor Cyan
& $fly apps create gatech-reddit --org personal

Write-Host "Deploying..." -ForegroundColor Cyan
& $fly deploy --region atl

Write-Host "Opening..." -ForegroundColor Green
& $fly open
