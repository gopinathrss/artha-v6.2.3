/**
 * V6 migrate-all — apply Prisma migrations to BOTH the personal and demo
 * databases in sequence. Used by start-artha.bat and the deploy runbook.
 *
 * Demo recovery: if `migrate deploy` hits **P3009** (failed migration stuck in
 * `_prisma_migrations`), we run `migrate resolve --rolled-back` for the known
 * bad migration `20260502180000_v52_integration_app_settings` (fixed SQL in
 * repo) and retry deploy once.
 *
 * Usage:
 *   node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/migrate-all.ts
 */
import { spawnSync } from 'child_process'
import path from 'path'

const STUCK_DEMO_MIGRATION = '20260502180000_v52_integration_app_settings'

function runMigrateDeploy(label: string, dbUrl: string): { ok: boolean; combined: string; status: number | null } {
  // eslint-disable-next-line no-console
  console.log(`\n=== Prisma migrate deploy → ${label} ===`)
  const env = { ...process.env, DATABASE_URL: dbUrl }
  const cli = path.resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
  const r = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    encoding: 'utf-8',
    env,
    stdio: ['inherit', 'pipe', 'pipe']
  })
  const stdout = r.stdout || ''
  const stderr = r.stderr || ''
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  const combined = stdout + stderr
  return { ok: r.status === 0, combined, status: r.status }
}

function runResolveRolledBack(dbUrl: string, migrationName: string): boolean {
  const env = { ...process.env, DATABASE_URL: dbUrl }
  const cli = path.resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
  // eslint-disable-next-line no-console
  console.log(`\n[migrate-all] prisma migrate resolve --rolled-back ${migrationName}`)
  const r = spawnSync(process.execPath, [cli, 'migrate', 'resolve', '--rolled-back', migrationName], {
    encoding: 'utf-8',
    env,
    stdio: ['inherit', 'pipe', 'pipe']
  })
  const out = (r.stdout || '') + (r.stderr || '')
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0) {
    // eslint-disable-next-line no-console
    console.warn('[migrate-all] resolve exited non-zero (migration may not be in failed state):', out.slice(0, 400))
    return false
  }
  return true
}

function needsDemoP3009Recovery(combined: string): boolean {
  return /P3009|migrate found failed migrations|failed migrations in the target database/i.test(combined)
}

const real = process.env.DATABASE_URL
const demo = process.env.DATABASE_URL_DEMO

if (!real) {
  // eslint-disable-next-line no-console
  console.error('[migrate-all] DATABASE_URL is required.')
  process.exit(1)
}

const personal = runMigrateDeploy('personal (DATABASE_URL)', real)
if (!personal.ok) {
  // eslint-disable-next-line no-console
  console.error(`[migrate-all] personal failed with exit code ${personal.status}`)
  process.exit(personal.status ?? 1)
}

if (demo && demo !== real) {
  let r = runMigrateDeploy('demo (DATABASE_URL_DEMO)', demo)
  if (!r.ok && needsDemoP3009Recovery(r.combined)) {
    // eslint-disable-next-line no-console
    console.log(
      '\n[migrate-all] Demo DB has a failed migration record (P3009). Clearing it so deploy can retry ' +
        '(safe after the fixed migration SQL was pulled from git).\n'
    )
    runResolveRolledBack(demo, STUCK_DEMO_MIGRATION)
    r = runMigrateDeploy('demo (DATABASE_URL_DEMO) — retry after resolve', demo)
  }
  if (!r.ok) {
    // eslint-disable-next-line no-console
    console.error(`[migrate-all] demo failed with exit code ${r.status}`)
    // eslint-disable-next-line no-console
    console.error(
      '\nManual fix (demo only):\n' +
        '  set DATABASE_URL=%DATABASE_URL_DEMO%\n' +
        `  npx prisma migrate resolve --rolled-back ${STUCK_DEMO_MIGRATION}\n` +
        '  npx prisma migrate deploy\n'
    )
    process.exit(r.status ?? 1)
  }
} else if (!demo) {
  // eslint-disable-next-line no-console
  console.warn('[migrate-all] DATABASE_URL_DEMO not set — skipping demo migrate.')
} else {
  // eslint-disable-next-line no-console
  console.warn('[migrate-all] DATABASE_URL_DEMO equals DATABASE_URL — skipping demo migrate.')
}

// eslint-disable-next-line no-console
console.log('\n[migrate-all] Done.')
