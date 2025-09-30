@echo off
echo ========================================
echo GA Tech Reddit - Deploy to Fly.io
echo ========================================
echo.

set FLY_API_TOKEN=FlyV1 fm2_lJPECAAAAAAACPvmxBDcTAURyD8/fErXoi1M30x7wrVodHRwczovL2FwaS5mbHkuaW8vdjGWAJLOABELjR8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxZL2utR1rB8goBbJ9kL8cuBJE/8YZY+JT1CUf8K70P/rfZ4/7fwZs/qeK62qwjUxLHR8EwbA7uiaD4GvLETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ==,fm2_lJPETreeNDrlvP57fuRxz0hB2HRK8trIBHCLVRKruJod5vDMzoK39nTUCTeOU6OK1U2TLn1YS+UNzIi3jbh/4M7wOkpq5deEmropzbXE4vq/dA2SlAORgc4AecTrHwWRgqdidWlsZGVyH6J3Zx8BxCAY14EpOuLRatIB3iP70IWZmVSk81LtzBfsEByzkMl2OQ==

cd /d "C:\Users\Jim\Desktop\pat-tools\gatech-reddit-system"

echo Step 1: Creating app...
"C:\Users\Jim\.fly\bin\flyctl.exe" apps create gatech-reddit --org personal 2>nul
if errorlevel 1 (
    echo App might already exist, continuing...
)

echo.
echo Step 2: Launching configuration...
"C:\Users\Jim\.fly\bin\flyctl.exe" launch --now --no-deploy --name gatech-reddit --org personal --region atl

echo.
echo Step 3: Deploying...
"C:\Users\Jim\.fly\bin\flyctl.exe" deploy -a gatech-reddit --now

echo.
echo Step 4: Opening app...
"C:\Users\Jim\.fly\bin\flyctl.exe" apps open -a gatech-reddit

echo.
echo ========================================
echo Done! App should be live at:
echo https://gatech-reddit.fly.dev
echo ========================================
pause
