@echo off
rem ========================================================
rem Gen Mockup - Status check
rem ========================================================
setlocal EnableExtensions
title GenMockup-Status

set "ROOT=%~dp0..\.."
set "LOGS=%ROOT%\logs"

echo ====================================
echo Gen Mockup - Status
echo ====================================
echo.

if exist "%LOGS%\api.pid" (
    for /f "delims=" %%P in (%LOGS%\api.pid) do (
        tasklist /FI "PID eq %%P" 2>nul | findstr /I "%%P" >nul
        if errorlevel 1 (
            echo [API]    PID %%P NOT running
        ) else (
            echo [API]    PID %%P running
        )
    )
) else (
    echo [API]    no pid file - not started via start.bat
)

if exist "%LOGS%\tunnel.pid" (
    for /f "delims=" %%P in (%LOGS%\tunnel.pid) do (
        tasklist /FI "PID eq %%P" 2>nul | findstr /I "%%P" >nul
        if errorlevel 1 (
            echo [Tunnel] PID %%P NOT running
        ) else (
            echo [Tunnel] PID %%P running
        )
    )
) else (
    echo [Tunnel] no pid file
)

echo.
echo Port 3000:
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object { '  Listening (PID ' + $_.OwningProcess + ')' }"

echo.
echo Health checks:
powershell -NoProfile -Command "try { Invoke-WebRequest 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; Write-Host '  Local : OK' -ForegroundColor Green } catch { Write-Host '  Local : DOWN' -ForegroundColor Red }"
powershell -NoProfile -Command "try { Invoke-WebRequest 'https://genmockup.primehorizon.studio/health' -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Host '  Tunnel: OK' -ForegroundColor Green } catch { Write-Host '  Tunnel: DOWN' -ForegroundColor Red }"

echo.
endlocal
