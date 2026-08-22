@echo off
rem ========================================================
rem Gen Mockup - Stop all background services
rem ========================================================
setlocal EnableExtensions
title GenMockup-Stop

set "ROOT=%~dp0..\.."
set "LOGS=%ROOT%\logs"

echo ====================================
echo Gen Mockup - Stopping services
echo ====================================
echo.

if exist "%LOGS%\api.pid" (
    for /f "delims=" %%P in (%LOGS%\api.pid) do (
        echo [API] Killing PID %%P...
        taskkill /F /PID %%P /T >nul 2>&1
    )
    del "%LOGS%\api.pid" >nul 2>&1
) else (
    echo [API] No pid file
)

if exist "%LOGS%\web.pid" (
    for /f "delims=" %%P in (%LOGS%\web.pid) do (
        echo [Web] Killing watcher PID %%P...
        taskkill /F /PID %%P /T >nul 2>&1
    )
    del "%LOGS%\web.pid" >nul 2>&1
) else (
    echo [Web] No pid file
)

if exist "%LOGS%\tunnel.pid" (
    for /f "delims=" %%P in (%LOGS%\tunnel.pid) do (
        echo [Tunnel app genmockup-ph] Killing PID %%P...
        taskkill /F /PID %%P /T >nul 2>&1
    )
    del "%LOGS%\tunnel.pid" >nul 2>&1
) else (
    echo [Tunnel app] No pid file
)

if exist "%LOGS%\tunnel-media.pid" (
    for /f "delims=" %%P in (%LOGS%\tunnel-media.pid) do (
        echo [Tunnel media genmockup] Killing PID %%P...
        taskkill /F /PID %%P /T >nul 2>&1
    )
    del "%LOGS%\tunnel-media.pid" >nul 2>&1
) else (
    echo [Tunnel media] No pid file
)

echo.
echo Cleaning up port 3000 + genmockup tunnels (fallback, KHONG dung token service)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like '*tunnel*genmockup*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo.
echo Done.
endlocal
