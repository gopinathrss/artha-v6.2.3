@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM ============================================================================
REM ARTHA V5.2 — no-Docker Windows dev (one double-click)
REM  - Portable PostgreSQL: C:\Projects\pgsql\bin  (cluster: ..\data-artha-v4)
REM  - Dev DB port: 5544 (matches .env.example DATABASE_URL)
REM  - Portable Node (preferred): C:\Projects\node\node-*-win-x64\node.exe + npm ^(same folder as official zip^)
REM    Fallback: .node-portable\node-*-win-x64\ then first `where node`
REM ============================================================================

set "PG_BIN=C:\Projects\pgsql\bin"
set "PGDATA=C:\Projects\pgsql\data-artha-v4"
set "PG_PORT=5544"
set "PG_LOG=%PGDATA%\postgresql-artha.log"

set "PRISMA_CLI=%~dp0node_modules\prisma\build\index.js"
set "TSX_CLI=%~dp0node_modules\tsx\dist\cli.mjs"
set "SERVER_TS=%~dp0src\api\server.ts"
set "MIGRATE_V52=%~dp0scripts\migrate-settings-to-v52.ts"
set "MIGRATE_ALL=%~dp0scripts\migrate-all.ts"

if not exist "%PG_BIN%\pg_ctl.exe" (
  echo [ERROR] Portable Postgres not found: "%PG_BIN%\pg_ctl.exe"
  echo         Install/extract PostgreSQL so bin\pg_ctl.exe exists, then re-run.
  pause
  exit /b 1
)

REM --- Node: C:\Projects\node — prefer versioned folder ^(full zip: npm beside node^) over lone node.exe at root ---
set "NODE="
for /d %%D in ("C:\Projects\node\node-*-win-x64") do (
  if exist "%%~fD\node.exe" set "NODE=%%~fD\node.exe" & goto :node_scan_done
)
if not defined NODE if exist "C:\Projects\node\node.exe" set "NODE=C:\Projects\node\node.exe"
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
  echo         Expected: C:\Projects\node\node-*-win-x64\node.exe  ^(full zip contents^)
  echo         Or:      C:\Projects\node\node.exe  ^(flat layout with npm.cmd next to it^)
  echo         Or:      .node-portable\node-*-win-x64\node.exe
  echo         Or:      Node 20+ on PATH
  pause
  exit /b 1
)

REM --- npm: npm.cmd beside node.exe; else npm-cli.js ^(same folder tree as official zip^); else PATH ---
set "NPM_CMD="
set "NPM_CLI_JS="
set "NODE_DIR="
for %%I in ("!NODE!") do set "NODE_DIR=%%~dpI"
REM npm lifecycle scripts ^(e.g. prisma preinstall^) invoke `node` by name — must be on PATH
set "PATH=!NODE_DIR!;%PATH%"
if exist "!NODE_DIR!npm.cmd" set "NPM_CMD=!NODE_DIR!npm.cmd"
if not defined NPM_CMD if exist "!NODE_DIR!npm.exe" set "NPM_CMD=!NODE_DIR!npm.exe"
if not defined NPM_CMD if exist "!NODE_DIR!node_modules\npm\bin\npm-cli.js" (
  set "NPM_CLI_JS=!NODE_DIR!node_modules\npm\bin\npm-cli.js"
)
if not defined NPM_CMD if not defined NPM_CLI_JS (
  for /f "delims=" %%n in ('where npm 2^>nul') do (
    set "NPM_CMD=%%n"
    goto :npm_cmd_done
  )
)
:npm_cmd_done

if not exist ".env" (
  echo [ERROR] Missing .env in "%CD%"
  echo         Copy .env.example to .env and set DATABASE_URL for port %PG_PORT% if needed.
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
echo === npm dependencies ^(install if tooling or key packages missing^) ===
set "NEED_DEPS="
if not exist "%PRISMA_CLI%" set "NEED_DEPS=1"
if not exist "%TSX_CLI%" set "NEED_DEPS=1"
if not exist "node_modules\@prisma\client" set "NEED_DEPS=1"
if not exist "node_modules\bcryptjs" set "NEED_DEPS=1"
if defined NEED_DEPS (
  if not defined NPM_CMD if not defined NPM_CLI_JS (
    echo [ERROR] npm not found for: !NODE!
    echo         Need one of:
    echo           - "!NODE_DIR!npm.cmd" ^(and npx.cmd^) from the official Node win-x64 **zip**
    echo           - "!NODE_DIR!node_modules\npm\bin\npm-cli.js" ^(full zip layout; not only node.exe^)
    echo           - npm on PATH ^(e.g. after installing Node from https://nodejs.org/^)
    echo         Fix: re-extract the whole zip into C:\Projects\node\ so npm ships beside node.exe.
    pause
    exit /b 1
  )
  if defined NPM_CLI_JS (
    echo [INFO] npm via: "!NODE!" "!NPM_CLI_JS!"
    call "!NODE!" "!NPM_CLI_JS!" ci
  ) else (
    echo [INFO] Using: !NPM_CMD!
    call "!NPM_CMD!" ci
  )
  if errorlevel 1 (
    echo [WARN] npm ci failed ^(lockfile or cache^) — trying npm install...
    if defined NPM_CLI_JS (
      call "!NODE!" "!NPM_CLI_JS!" install
    ) else (
      call "!NPM_CMD!" install
    )
    if errorlevel 1 (
      echo [ERROR] npm install failed. Fix errors above, then re-run start-artha.bat.
      pause
      exit /b 1
    )
  )
  set "NEED_DEPS="
)

if not exist "%PRISMA_CLI%" (
  echo [ERROR] Missing "%PRISMA_CLI%"
  echo         npm install did not complete. From "%CD%", run npm ci ^(same Node as this script^).
  pause
  exit /b 1
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
echo === Prisma: migrate deploy ^(personal + demo^) ===
echo   Demo P3009 ^(stuck failed migration^): migrate-all.ts auto-runs resolve --rolled-back for
echo   20260502180000_v52_integration_app_settings then retries deploy once.
if exist "%MIGRATE_ALL%" (
  "%NODE%" --env-file=.env "%TSX_CLI%" "%MIGRATE_ALL%"
  if errorlevel 1 (
    echo.
    echo [WARN] migrate-all failed.
    echo   First-time DB:  "%NODE%" "%PRISMA_CLI%" migrate dev
    echo   Demo still stuck: same folder, with .env ^(loads DATABASE_URL_DEMO^):
    echo     "%NODE%" --env-file=.env "%PRISMA_CLI%" migrate resolve --rolled-back 20260502180000_v52_integration_app_settings
    echo     ^(set DATABASE_URL in that shell to your DEMO URL from .env if --env-file is not used^)
    echo     "%NODE%" --env-file=.env "%PRISMA_CLI%" migrate deploy
    pause
  )
) else (
  "%NODE%" "%PRISMA_CLI%" migrate deploy
  if errorlevel 1 (
    echo [WARN] migrate deploy failed. First-time DB? Try:  "%NODE%" "%PRISMA_CLI%" migrate dev
    pause
  )
)

echo.
echo === V5.2: legacy settings -^> IntegrationProvider ^(idempotent^) ===
if exist "%MIGRATE_V52%" (
  "%NODE%" --env-file=.env "%TSX_CLI%" "%MIGRATE_V52%"
  if errorlevel 1 (
    echo [WARN] migrate-settings-to-v52.ts failed ^(AppSettings/Integration tables may be missing — run migrate deploy first^).
  )
) else (
  echo [WARN] Missing "%MIGRATE_V52%" — skip V5.2 secret migration.
)

echo.
echo === ARTHA V5.2 dev server ^(http://localhost:3002^) ===
echo Using Node: %NODE%
"%NODE%" --env-file=.env "%TSX_CLI%" "%SERVER_TS%"

pause
endlocal
