@echo off
rem ========================================================
rem Gen Mockup - Start all services in background
rem API (Fastify+SQLite) + Cloudflared tunnel
rem ========================================================
setlocal EnableExtensions EnableDelayedExpansion
title GenMockup-Start

set "ROOT=%~dp0..\.."
pushd "%ROOT%" >nul

set "LOGS=%ROOT%\logs"
if not exist "%LOGS%" mkdir "%LOGS%"

echo ====================================
echo Gen Mockup - Background Startup
echo ====================================
echo Root: %CD%
echo Logs: %LOGS%
echo.

echo [1/4] Cleaning up stale processes on port 3000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo.

if not exist "%ROOT%\apps\web\dist\index.html" (
    echo [2/4] FE dist not found - initial build...
    call pnpm --filter web build
    echo.
) else (
    echo [2/4] FE dist exists - watcher will rebuild it.
    echo.
)

echo     Starting FE build watcher in background (auto-rebuild on change)...
powershell -NoProfile -WindowStyle Hidden -Command "$out = Join-Path '%LOGS%' 'web.log'; $err = Join-Path '%LOGS%' 'web.err.log'; $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','pnpm','--filter','web','build:watch' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path (Join-Path '%LOGS%' 'web.pid') -Value $p.Id"
echo     - Web watcher PID:
type "%LOGS%\web.pid" 2>nul
echo.
echo.

echo [3/4] Starting API server in background (watch mode, auto-reload on change)...
powershell -NoProfile -WindowStyle Hidden -Command "$out = Join-Path '%LOGS%' 'api.log'; $err = Join-Path '%LOGS%' 'api.err.log'; $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','pnpm','--filter','api','dev' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path (Join-Path '%LOGS%' 'api.pid') -Value $p.Id"
echo     - API PID:
type "%LOGS%\api.pid" 2>nul
echo.
echo.

echo [4/4] Starting Cloudflared tunnels in background...
rem Kill existing genmockup / genmockup-ph replicas (KHONG dung cloudflared service/token tunnel khac)
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like '*tunnel*genmockup*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

rem Tunnel 1: genmockup (media.bullstart.us) - config mac dinh ~/.cloudflared/config.yml
powershell -NoProfile -WindowStyle Hidden -Command "$out = Join-Path '%LOGS%' 'tunnel-media.log'; $err = Join-Path '%LOGS%' 'tunnel-media.err.log'; $p = Start-Process -FilePath 'cloudflared.exe' -ArgumentList 'tunnel','run','genmockup' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path (Join-Path '%LOGS%' 'tunnel-media.pid') -Value $p.Id"
echo     - Tunnel media (genmockup) PID:
type "%LOGS%\tunnel-media.pid" 2>nul

rem Tunnel 2: genmockup-ph (genmockup.primehorizon.studio) - config-ph.yml (account moi)
powershell -NoProfile -WindowStyle Hidden -Command "$out = Join-Path '%LOGS%' 'tunnel.log'; $err = Join-Path '%LOGS%' 'tunnel.err.log'; $cfg = Join-Path $env:USERPROFILE '.cloudflared\config-ph.yml'; $p = Start-Process -FilePath 'cloudflared.exe' -ArgumentList 'tunnel','--config',$cfg,'run','genmockup-ph' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path (Join-Path '%LOGS%' 'tunnel.pid') -Value $p.Id"
echo     - Tunnel app (genmockup-ph) PID:
type "%LOGS%\tunnel.pid" 2>nul
echo.
echo.

echo Waiting 6 seconds for services...
powershell -NoProfile -Command "Start-Sleep -Seconds 6"

powershell -NoProfile -Command "try { Invoke-WebRequest 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Host '  API local : OK' -ForegroundColor Green } catch { Write-Host '  API local : FAIL - check logs\api.err.log' -ForegroundColor Red }"

powershell -NoProfile -Command "try { Invoke-WebRequest 'https://genmockup.primehorizon.studio/health' -UseBasicParsing -TimeoutSec 10 | Out-Null; Write-Host '  Tunnel    : OK (https://genmockup.primehorizon.studio)' -ForegroundColor Green } catch { Write-Host '  Tunnel    : not ready yet - check logs\tunnel.err.log' -ForegroundColor Yellow }"

echo.
echo ====================================
echo Started. Open: https://genmockup.primehorizon.studio
echo Stop with: scripts\windows\stop.bat
echo Logs in : %LOGS%
echo ====================================
echo.
popd >nul
endlocal
