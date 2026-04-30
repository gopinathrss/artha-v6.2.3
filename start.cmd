@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM ---------------------------------------------------------------------------
REM ARTHA V4 — Windows dev start
REM  - DB port: set in .env (DATABASE_URL … :5433/…). This script mentions 5433 in messages only.
REM  - Prisma: uses "node …\prisma\build\index.js" so portable Node without npm/npx still works.
REM  - Dev server: node --env-file=.env …\tsx\dist\cli.mjs src\api\server.ts (same as npm run dev).
REM ---------------------------------------------------------------------------

set "PG_PORT=5433"
set "PRISMA_CLI=%~dp0node_modules\prisma\build\index.js"
set "TSX_CLI=%~dp0node_modules\tsx\dist\cli.mjs"
set "SERVER_TS=%~dp0src\api\server.ts"

REM --- Resolve Node: portable full path first, else first `where node` ---
set "NODE="
if exist "%~dp0.node-portable\node-v22.14.0-win-x64\node.exe" (
  set "NODE=%~dp0.node-portable\node-v22.14.0-win-x64\node.exe"
) else (
  for /d %%D in ("%~dp0.node-portable\node-*-win-x64") do (
    if exist "%%~fD\node.exe" set "NODE=%%~fD\node.exe" & goto :node_found
  )
)
:node_found
if not defined NODE (
  for /f "delims=" %%i in ('where node 2^>nul') do set "NODE=%%i" & goto :node_ok
)
:node_ok
if not defined NODE (
  echo [ERROR] Node.js not found. Install Node 20+ or add .node-portable\node-*-win-x64\
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] Missing .env in "%CD%"
  pause
  exit /b 1
)

if not exist "%PRISMA_CLI%" (
  echo [ERROR] Missing "%PRISMA_CLI%" — run once from a machine with npm:  npm ci
  pause
  exit /b 1
)

echo.
echo === PostgreSQL (Windows service) ===
echo [INFO] Expecting Postgres on 127.0.0.1:%PG_PORT% (see DATABASE_URL in .env).
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sv = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)postgres' -or $_.DisplayName -match 'PostgreSQL' }; " ^
  "if (-not $sv) { Write-Host '[INFO] No PostgreSQL service matched by name. If you use Docker/WSL, start Postgres yourself.'; exit 0 }; " ^
  "$sv | ForEach-Object { if ($_.Status -ne 'Running') { try { Start-Service $_.Name -ErrorAction Stop; Write-Host ('Started: ' + $_.Name) } catch { Write-Host ('[WARN] Could not start ' + $_.Name + ' — try Administrator CMD or services.msc') } } else { Write-Host ('Already running: ' + $_.Name) } }"

echo Waiting a few seconds for TCP %PG_PORT%...
timeout /t 4 /nobreak >nul

echo.
echo === npm install (if @prisma/client missing; uses npm from PATH, not portable npx) ===
if not exist "node_modules\@prisma\client" (
  where npm >nul 2>&1 && ( call npm ci ) || ( call npm install )
  if errorlevel 1 (
    echo [WARN] npm install failed. Install dependencies once from a full Node install, then re-run start.cmd.
  )
)

echo.
echo === Prisma: generate (via node, no npx) ===
echo [TIP] If you see EPERM on query_engine*.dll under OneDrive: close other Node/Cursor terminals using this repo,
echo       pause OneDrive sync for this folder, or clone artha-v4 to a path outside OneDrive (e.g. C:\src\artha-v4).

REM OneDrive / Defender often block Prisma's "rename .tmp -> .dll" in node_modules\.prisma\client — clear locks first.
if exist "%~dp0node_modules\.prisma\client" (
  attrib -r "%~dp0node_modules\.prisma\client\*.*" /s >nul 2>&1
  del /f /q "%~dp0node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" 2>nul
  del /f /q "%~dp0node_modules\.prisma\client\query_engine-windows.dll.node" 2>nul
)

"%NODE%" "%PRISMA_CLI%" generate
if errorlevel 1 (
  echo.
  echo [ERROR] prisma generate failed.
  echo   Common on Windows + OneDrive: EPERM when renaming the Prisma query engine under node_modules\.prisma
  echo   Try: 1^) Right-click OneDrive tray ^> Pause syncing, run start.cmd again
  echo        2^) Move the project folder out of OneDrive (recommended for Node projects)
  echo        3^) Exclude this folder from real-time antivirus scan for node_modules
  pause
  exit /b 1
)

echo.
echo === Prisma: migrate deploy ===
"%NODE%" "%PRISMA_CLI%" migrate deploy
if errorlevel 1 (
  echo [WARN] migrate deploy failed. First-time DB? Try:  "%NODE%" "%PRISMA_CLI%" migrate dev
  pause
)

echo.
echo === ARTHA V4 dev server (http://localhost:3002) ===
"%NODE%" --env-file=.env "%TSX_CLI%" "%SERVER_TS%"

pause
endlocal
