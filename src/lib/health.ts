import { prisma } from './prisma'

export type HealthRow = { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string }

export async function runHealthChecks(): Promise<{ checks: HealthRow[]; trustScore: number }> {
  const checks: HealthRow[] = []

  const fx = await prisma.fXRate.findFirst({
    where: { base: 'CZK', quote: 'EUR' },
    orderBy: { fetchedAt: 'desc' }
  })
  const fxAgeH = fx ? (Date.now() - fx.fetchedAt.getTime()) / 3600000 : 999
  checks.push({
    name: 'FX_FRESHNESS',
    status: fxAgeH < 24 ? 'PASS' : fxAgeH < 72 ? 'WARN' : 'FAIL',
    message: fx ? `Last fetch ${fxAgeH.toFixed(1)}h ago` : 'No FX rows'
  })

  try {
    const nav = await prisma.navHistory.findFirst({ orderBy: { date: 'desc' } })
    const navAgeDays = nav ? (Date.now() - nav.date.getTime()) / 86400000 : 999
    checks.push({
      name: 'NAV_FRESHNESS',
      status: nav ? (navAgeDays < 5 ? 'PASS' : navAgeDays < 10 ? 'WARN' : 'FAIL') : 'WARN',
      message: nav ? `Last NAV ${navAgeDays.toFixed(1)}d` : 'No NavHistory yet'
    })
  } catch {
    checks.push({ name: 'NAV_FRESHNESS', status: 'WARN', message: 'Skip' })
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.push({ name: 'DB_HEALTH', status: 'PASS' })
  } catch (e: any) {
    checks.push({ name: 'DB_HEALTH', status: 'FAIL', message: e?.message })
  }

  const s = await prisma.settings.findFirst()
  checks.push({
    name: 'EMAIL_CONFIGURED',
    status: s?.smtpUser && s?.smtpPass ? 'PASS' : 'WARN',
    message: s?.smtpUser ? 'SMTP set' : 'Not configured'
  })

  checks.push({
    name: 'AI_REACHABLE',
    status: (process.env.ANTHROPIC_API_KEY || s?.openaiApiKey || process.env.OPENAI_API_KEY) ? 'PASS' : 'WARN',
    message: 'Set ANTHROPIC_API_KEY or OpenAI in settings'
  })

  const prof = await prisma.userProfile.findUnique({ where: { id: 'default' } })
  checks.push({
    name: 'PROFILE_COMPLETE',
    status: prof && prof.monthlyNetIncomeCzk > 0 ? 'PASS' : 'WARN',
    message: prof ? 'Profile exists' : 'Run onboarding'
  })

  const libN = await prisma.instrumentLibrary.count()
  checks.push({
    name: 'LIBRARY',
    status: libN >= 20 ? 'PASS' : libN > 0 ? 'WARN' : 'FAIL',
    message: `${libN} instruments`
  })

  const pass = checks.filter((c) => c.status === 'PASS').length
  const warn = checks.filter((c) => c.status === 'WARN').length
  const n = Math.max(1, checks.length)
  const trustPct = Math.min(100, Math.round((pass * 100 + warn * 50) / n))

  return { checks, trustScore: trustPct }
}
