@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM ============================================================================
REM ARTHA V4 — no-Docker Windows dev (one double-click)
REM  - Portable PostgreSQL: C:\Projects\pgsql\bin  (cluster: ..\data-artha-v4)
REM  - Dev DB port: 5544 (matches .env.example DATABASE_URL)
REM  - Portable Node (preferred): C:\Projects\node\node.exe
REM    Fallback: .node-portable\node-*-win-x64\ then first `where node`
REM ============================================================================

set "PG_BIN=C:\Projects\pgsql\bin"
set "PGDATA=C:\Projects\pgsql\data-artha-v4"
set "PG_PORT=5544"
set "PG_LOG=%PGDATA%\postgresql-artha.log"

set "PRISMA_CLI=%~dp0node_modules\prisma\build\index.js"
set "TSX_CLI=%~dp0node_modules\tsx\dist\cli.mjs"
set "SERVER_TS=%~dp0src\api\server.ts"

if not exist "%PG_BIN%\pg_ctl.exe" (
  echo [ERROR] Portable Postgres not found: "%PG_BIN%\pg_ctl.exe"
  echo         Install/extract PostgreSQL so bin\pg_ctl.exe exists, then re-run.
  pause
  exit /b 1
)

REM --- Node: brief order — C:\Projects\node, then repo .node-portable, then PATH ---
set "NODE="
if exist "C:\Projects\node\node.exe" (
  set "NODE=C:\Projects\node\node.exe"
) else (
  for /d %%D in ("C:\Projects\node\node-*-win-x64") do (
    if exist "%%~fD\node.exe" set "NODE=%%~fD\node.exe" & goto :node_scan_done
  )
)
:node_scan_done
if not defined NODE (
  if exist "%~dp0.node-portable\node-v22.14.0-win-x64\node.exe" (
    set "NODE=%~dp0.node-portable\node-v22.14.0-win-x64\node.exe"
  ) else (
    for /d %%D in ("%~dp0.node-portable\node-*-win-x64") do (
      if exist "%%~fD\node.exe" set "NODE=%%~fD\node.exe" & goto :node_found
    )
  )
)
:node_found
if not defined NODE (
  for /f "delims=" %%i in ('where node 2^>nul') do set "NODE=%%i" & goto :node_ok
)
:node_ok
if not defined NODE (
  echo [ERROR] Node.js not found.
  echo         Expected: C:\Projects\node\node.exe  ^(extract Node win-x64 zip there^)
  echo         Or:      .node-portable\node-*-win-x64\node.exe
  echo         Or:      Node 20+ on PATH
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] Missing .env in "%CD%"
  echo         Copy .env.example to .env and set DATABASE_URL for port %PG_PORT% if needed.
  pause
  exit /b 1
)

if not exist "%PRISMA_CLI%" (
  echo [ERROR] Missing "%PRISMA_CLI%" — run once:  npm ci
  pause
  exit /b 1
)

echo.
echo === PostgreSQL portable ^(%PG_PORT%^) ===
if not exist "%PGDATA%\PG_VERSION" (
  echo [INFO] First run: initializing cluster at "%PGDATA%"
  if not exist "%PGDATA%" mkdir "%PGDATA%" 2>nul
  "%PG_BIN%\initdb.exe" -D "%PGDATA%" -U postgres --encoding=UTF8 --locale=C --auth-local=trust --auth-host=trust
  if errorlevel 1 (
    echo [ERROR] initdb failed.
    pause
    exit /b 1
  )
)

"%PG_BIN%\pg_ctl.exe" status -D "%PGDATA%" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Starting Postgres ^(log: %PG_LOG%^)...
  "%PG_BIN%\pg_ctl.exe" -D "%PGDATA%" -l "%PG_LOG%" -w start -o "-p %PG_PORT%"
  if errorlevel 1 (
    echo [ERROR] pg_ctl start failed. See log: %PG_LOG%
    pause
    exit /b 1
  )
) else (
  echo [INFO] Postgres cluster already running.
)

set /a _wait=0
:wait_pg
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% -U postgres >nul 2>&1
if errorlevel 1 (
  set /a _wait+=1
  if !_wait! GEQ 30 (
    echo [ERROR] Postgres did not accept connections on 127.0.0.1:%PG_PORT% in time.
    pause
    exit /b 1
  )
  timeout /t 1 /nobreak >nul
  goto :wait_pg
)

echo [INFO] Postgres is ready on 127.0.0.1:%PG_PORT%

set "DBCHK="
"%PG_BIN%\psql.exe" -h 127.0.0.1 -p %PG_PORT% -U postgres -d postgres -Atf "%~dp0scripts\exists-artha-db.sql" >"%TEMP%\artha_dbchk.txt" 2>nul
set /p DBCHK=<"%TEMP%\artha_dbchk.txt"
if not "!DBCHK!"=="1" (
  echo [INFO] Creating database artha_v4...
  "%PG_BIN%\psql.exe" -h 127.0.0.1 -p %PG_PORT% -U postgres -d postgres -c "CREATE DATABASE artha_v4;"
  if errorlevel 1 (
    echo [ERROR] CREATE DATABASE artha_v4 failed.
    pause
    exit /b 1
  )
)

echo.
echo === npm install ^(if @prisma/client missing^) ===
if not exist "node_modules\@prisma\client" (
  where npm >nul 2>&1 && ( call npm ci ) || ( call npm install )
  if errorlevel 1 (
    echo [WARN] npm install failed. Install dependencies once, then re-run start-artha.bat.
  )
)

echo.
echo === Prisma: generate ===
REM Do NOT delete query_engine-windows.dll.node here: if any Node process (dev
REM server, Cursor, tests) has it loaded, delete fails silently and generate
REM still hits EPERM on rename. Only clear stale partial .tmp files.
if exist "%~dp0node_modules\.prisma\client" (
  attrib -r "%~dp0node_modules\.prisma\client\*.*" /s >nul 2>&1
  del /f /q "%~dp0node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" 2>nul
)

"%NODE%" "%PRISMA_CLI%" generate
if not errorlevel 1 goto :prisma_generate_ok

echo [WARN] prisma generate failed ^(attempt 1/4^). Retrying after 4s ^(often EPERM: engine DLL locked^)...
timeout /t 4 /nobreak >nul
"%NODE%" "%PRISMA_CLI%" generate
if not errorlevel 1 goto :prisma_generate_ok

echo [WARN] prisma generate failed ^(attempt 2/4^). Retrying after 4s...
timeout /t 4 /nobreak >nul
"%NODE%" "%PRISMA_CLI%" generate
if not errorlevel 1 goto :prisma_generate_ok

echo [WARN] prisma generate failed ^(attempt 3/4^). Retrying after 4s...
timeout /t 4 /nobreak >nul
"%NODE%" "%PRISMA_CLI%" generate
if not errorlevel 1 goto :prisma_generate_ok

REM Last resort: continue if a previous generate left a usable client ^(schema unchanged^).
if exist "%~dp0node_modules\.prisma\client\index.js" if exist "%~dp0node_modules\.prisma\client\query_engine-windows.dll.node" (
  echo.
  echo [WARN] prisma generate still failing — continuing with EXISTING Prisma client + query engine.
  echo       If you edited prisma\schema.prisma: stop ALL Node/Cursor terminals using this repo, then run:
  echo         npm run db:generate
  echo       Or close the dev server on port 3002 and re-run start-artha.bat.
  goto :prisma_generate_ok
)

echo.
echo [ERROR] prisma generate failed and no usable Prisma client found under node_modules\.prisma\client
echo   Common causes: EPERM rename on query_engine-windows.dll.node ^(file locked by another process^)
echo   Try: 1^) Close dev server / Playwright / any `node` using this folder  2^) Pause OneDrive for this path
echo        3^) Add Windows Defender exclusion for node_modules\.prisma  4^) Run:  npm run db:generate
pause
exit /b 1

:prisma_generate_ok

echo.
echo === Prisma: migrate deploy ===
"%NODE%" "%PRISMA_CLI%" migrate deploy
if errorlevel 1 (
  echo [WARN] migrate deploy failed. First-time DB? Try:  "%NODE%" "%PRISMA_CLI%" migrate dev
  pause
)

echo.
echo === ARTHA V4 dev server ^(http://localhost:3002^) ===
echo Using Node: %NODE%
"%NODE%" --env-file=.env "%TSX_CLI%" "%SERVER_TS%"

pause
endlocal
