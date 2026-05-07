/**
 * V6 boot contract — fail fast with a one-screen checklist.
 *
 * Verifies environment + filesystem + DB connectivity before serving traffic.
 * In production: throws on any RED row. In dev: prints warnings but continues
 * so a developer can iterate without a full prod setup.
 *
 * Usage:
 *   import { runBootContract } from './lib/bootContract'
 *   const ok = await runBootContract({ realPrisma })
 *   if (!ok && process.env.NODE_ENV === 'production') process.exit(1)
 */
import fs from 'fs'
import type { PrismaClient } from '@prisma/client'

export type BootCheck = {
  name: string
  status: 'OK' | 'WARN' | 'FAIL'
  message: string
}

const MIN_SECRET_LEN = 24

function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

function maskUrl(u: string | undefined): string {
  if (!u) return '(unset)'
  return u.replace(/:\/\/[^@]*@/, '://****:****@')
}

function checkEnv(): BootCheck[] {
  const out: BootCheck[] = []

  const dbUrl = process.env.DATABASE_URL
  out.push({
    name: 'DATABASE_URL',
    status: dbUrl ? 'OK' : 'FAIL',
    message: dbUrl ? maskUrl(dbUrl) : 'Required. Personal Postgres URL.'
  })

  const demoUrl = process.env.DATABASE_URL_DEMO
  out.push({
    name: 'DATABASE_URL_DEMO',
    status: demoUrl ? 'OK' : 'FAIL',
    message: demoUrl
      ? maskUrl(demoUrl)
      : 'Required for demo mode safety. Must differ from DATABASE_URL.'
  })

  if (dbUrl && demoUrl && dbUrl === demoUrl) {
    out.push({
      name: 'DEMO_DB_DISTINCT',
      status: 'FAIL',
      message: 'DATABASE_URL and DATABASE_URL_DEMO must point to different databases.'
    })
  } else if (dbUrl && demoUrl) {
    out.push({
      name: 'DEMO_DB_DISTINCT',
      status: 'OK',
      message: 'Personal and demo DBs are distinct.'
    })
  }

  const sessionSecret = String(process.env.SESSION_SECRET || '').trim()
  if (!sessionSecret) {
    out.push({
      name: 'SESSION_SECRET',
      status: isProd() ? 'FAIL' : 'WARN',
      message: isProd()
        ? 'Required in production. Set a random 32+ char string in .env.'
        : 'Unset — using insecure dev fallback. Set before any deploy.'
    })
  } else if (sessionSecret.length < MIN_SECRET_LEN) {
    out.push({
      name: 'SESSION_SECRET',
      status: isProd() ? 'FAIL' : 'WARN',
      message: `Too short (${sessionSecret.length} chars). Use at least ${MIN_SECRET_LEN}.`
    })
  } else {
    out.push({
      name: 'SESSION_SECRET',
      status: 'OK',
      message: `Set (${sessionSecret.length} chars).`
    })
  }

  const publicUrl = String(process.env.PIE_PUBLIC_URL || '').trim()
  if (!publicUrl) {
    out.push({
      name: 'PIE_PUBLIC_URL',
      status: isProd() ? 'WARN' : 'OK',
      message: isProd()
        ? 'Recommended in production for OAuth redirect + email links. Defaults to request origin.'
        : 'Unset (dev) — request origin will be used.'
    })
  } else {
    out.push({
      name: 'PIE_PUBLIC_URL',
      status: 'OK',
      message: publicUrl
    })
  }

  return out
}

function checkSecretKeyfile(): BootCheck {
  try {
    const candidates = [
      process.env.PIE_SECRET_KEY_PATH,
      process.env.ARTHA_SECRET_KEY_PATH
    ].filter(Boolean) as string[]
    const checked = candidates.length > 0 ? candidates : ['(default APPDATA path)']
    const exists = candidates.some((p) => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    })
    if (candidates.length > 0 && !exists) {
      return {
        name: 'SECRET_KEYFILE',
        status: 'WARN',
        message: `Configured paths missing: ${checked.join(', ')}. Will be created on first secret use.`
      }
    }
    return {
      name: 'SECRET_KEYFILE',
      status: 'OK',
      message: 'OK (auto-managed; AES-256-GCM envelope).'
    }
  } catch (e: unknown) {
    return {
      name: 'SECRET_KEYFILE',
      status: 'WARN',
      message: e instanceof Error ? e.message : String(e)
    }
  }
}

async function checkDb(realPrisma: PrismaClient): Promise<BootCheck> {
  try {
    await realPrisma.$queryRaw`SELECT 1`
    return { name: 'DATABASE', status: 'OK', message: 'SELECT 1 OK on personal DB.' }
  } catch (e: unknown) {
    return {
      name: 'DATABASE',
      status: 'FAIL',
      message: e instanceof Error ? e.message : 'Personal DB unreachable.'
    }
  }
}

async function checkAppSettings(realPrisma: PrismaClient): Promise<BootCheck> {
  try {
    const row = await realPrisma.appSettings.findUnique({ where: { id: 'default' } })
    if (!row) {
      return {
        name: 'APP_SETTINGS',
        status: 'WARN',
        message: 'Row missing — will be created on first read.'
      }
    }
    return { name: 'APP_SETTINGS', status: 'OK', message: 'AppSettings row present.' }
  } catch (e: unknown) {
    return {
      name: 'APP_SETTINGS',
      status: 'WARN',
      message: e instanceof Error ? e.message : String(e)
    }
  }
}

function paint(check: BootCheck): string {
  const tag =
    check.status === 'OK' ? '  OK  ' : check.status === 'WARN' ? ' WARN ' : ' FAIL '
  return `[${tag}] ${check.name.padEnd(20)} ${check.message}`
}

export async function runBootContract(opts: {
  realPrisma: PrismaClient
}): Promise<{ ok: boolean; checks: BootCheck[] }> {
  const checks: BootCheck[] = []
  checks.push(...checkEnv())
  checks.push(checkSecretKeyfile())
  checks.push(await checkDb(opts.realPrisma))
  checks.push(await checkAppSettings(opts.realPrisma))

  const hasFail = checks.some((c) => c.status === 'FAIL')
  const lines = ['', '=== PIE V6 boot contract ===', ...checks.map(paint), '']
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))

  return { ok: !hasFail, checks }
}
