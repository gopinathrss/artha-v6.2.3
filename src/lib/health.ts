import { getPrisma, realPrisma } from './prisma'
import { num } from './money'
import { isAdherenceRow } from './allocationRowTypes'
import { FX_STALENESS_FAIL_HOURS, FX_STALENESS_WARN_HOURS, getFxAgeHours } from './currency'
import { getRbiRepoRate, getStalestNREFDAge } from './indiaIntelligence'

export type HealthRow = { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string }

/** Spec target: named checks (trust score divides by this count). */
export const HEALTH_CHECK_COUNT = 16

/** When the DB is unreachable, return named rows so `/api/health` stays JSON 200 (observability). */
function healthChecksWhenDbDown(dbMessage: string): { checks: HealthRow[]; trustScore: number } {
  const rest: HealthRow['name'][] = [
    'FX_FRESHNESS',
    'NAV_FRESHNESS',
    'EMAIL_CONFIGURED',
    'AI_REACHABLE',
    'PROFILE_COMPLETE',
    'RBI_RATE_FRESHNESS',
    'NRE_FD_RATE_FRESHNESS',
    'LIBRARY',
    'SNAPSHOT_FRESHNESS',
    'PLAN_COVERAGE',
    'ADHERENCE_KNOWN',
    'BACKUP_RECENT',
    'AI_RECENT_FAILURES',
    'CRON_HEALTH',
    'MEMORY_HEALTHY'
  ]
  const checks: HealthRow[] = [
    { name: 'DB_HEALTH', status: 'FAIL', message: dbMessage },
    ...rest.map((name) => ({
      name,
      status: 'WARN' as const,
      message: 'Skipped — database unavailable'
    }))
  ]
  return { checks, trustScore: 0 }
}

export async function runHealthChecks(): Promise<{ checks: HealthRow[]; trustScore: number }> {
  const checks: HealthRow[] = []
  let prisma: Awaited<ReturnType<typeof getPrisma>>
  try {
    prisma = await getPrisma()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Database unreachable'
    return healthChecksWhenDbDown(msg)
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.push({ name: 'DB_HEALTH', status: 'PASS' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Database unreachable'
    return healthChecksWhenDbDown(msg)
  }

  let fxAgeH = Number.POSITIVE_INFINITY
  try {
    fxAgeH = await getFxAgeHours()
  } catch {
    fxAgeH = Number.POSITIVE_INFINITY
  }
  const fxOk = Number.isFinite(fxAgeH)
  let fxSt: HealthRow['status'] = 'FAIL'
  let fxMsg = 'No FX rows'
  if (fxOk) {
    if (fxAgeH > FX_STALENESS_FAIL_HOURS) fxSt = 'FAIL'
    else if (fxAgeH > FX_STALENESS_WARN_HOURS) fxSt = 'WARN'
    else fxSt = 'PASS'
    fxMsg = `FX age (stalest leg) ${fxAgeH.toFixed(1)}h (warn>${FX_STALENESS_WARN_HOURS}h, fail>${FX_STALENESS_FAIL_HOURS}h)`
  }
  checks.push({
    name: 'FX_FRESHNESS',
    status: fxSt,
    message: fxMsg
  })

  try {
    const nav = await prisma.navHistory.findFirst({ orderBy: { date: 'desc' } })
    const navAgeDays = nav ? (Date.now() - nav.date.getTime()) / 86400000 : 999
    const tracked = await prisma.holding.findMany({
      where: { status: 'ACTIVE', navSourceType: { in: ['ERSTE', 'YAHOO', 'AMFI'] } },
      select: { navLastFetchedAt: true }
    })
    let worstHoldDays = 0
    for (const h of tracked) {
      if (!h.navLastFetchedAt) {
        worstHoldDays = 999
        break
      }
      const d = (Date.now() - h.navLastFetchedAt.getTime()) / 86400000
      if (d > worstHoldDays) worstHoldDays = d
    }
    const histStale = !nav || navAgeDays >= 10
    const holdStale = tracked.length > 0 && worstHoldDays > 7
    let st: HealthRow['status'] = 'PASS'
    if (!nav && tracked.length === 0) st = 'WARN'
    else if (histStale || holdStale) st = navAgeDays >= 14 || worstHoldDays > 10 ? 'FAIL' : 'WARN'
    checks.push({
      name: 'NAV_FRESHNESS',
      status: st,
      message: nav
        ? `NavHistory ${navAgeDays.toFixed(1)}d; ERSTE/YAHOO/AMFI holdings max ${worstHoldDays.toFixed(1)}d since fetch`
        : 'No NavHistory yet'
    })
  } catch {
    checks.push({ name: 'NAV_FRESHNESS', status: 'WARN', message: 'Skip' })
  }

  const s = await realPrisma.settings.findFirst()
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
    status: prof && num(prof.monthlyNetIncomeCzk) > 0 ? 'PASS' : 'WARN',
    message: prof ? 'Profile exists' : 'Run onboarding'
  })

  {
    const rbi = getRbiRepoRate()
    let rbiSt: HealthRow['status'] = 'PASS'
    if (rbi.ageInDays > 180) rbiSt = 'FAIL'
    else if (rbi.ageInDays >= 90) rbiSt = 'WARN'
    checks.push({
      name: 'RBI_RATE_FRESHNESS',
      status: rbiSt,
      message:
        rbiSt === 'FAIL'
          ? `RBI rate verified ${rbi.ageInDays}d ago (>180d). Update RBI_REPO_RATE in indiaIntelligence.ts.`
          : rbiSt === 'WARN'
            ? `RBI repo ${rbi.value.toFixed(2)}% — verified ${rbi.ageInDays}d ago (≥90d; check rbi.org.in/MonetaryPolicy).`
            : `RBI repo ${rbi.value.toFixed(2)}% (${rbi.source}; verified ${rbi.ageInDays}d ago)`
    })
  }

  try {
    const ageRaw = await getStalestNREFDAge()
    const days = Number.isFinite(ageRaw) ? Math.floor(ageRaw) : NaN
    let st: HealthRow['status'] = 'PASS'
    if (!Number.isFinite(days)) st = 'WARN'
    else if (days > 60) st = 'FAIL'
    else if (days >= 30) st = 'WARN'
    checks.push({
      name: 'NRE_FD_RATE_FRESHNESS',
      status: st,
      message: Number.isFinite(days)
        ? `Oldest NRE FD rate row: ${days}d since validFrom (warn>=30d, fail>60d)`
        : 'No NRE FD rate rows'
    })
  } catch {
    checks.push({ name: 'NRE_FD_RATE_FRESHNESS', status: 'WARN', message: 'Skip' })
  }

  const libN = await prisma.instrumentLibrary.count()
  checks.push({
    name: 'LIBRARY',
    status: libN >= 20 ? 'PASS' : libN > 0 ? 'WARN' : 'FAIL',
    message: `${libN} instruments`
  })

  try {
    const lastSnap = await prisma.snapshot.findFirst({ orderBy: { date: 'desc' } })
    const snapAgeD = lastSnap
      ? (Date.now() - new Date(lastSnap.date).getTime()) / 86400000
      : 999
    checks.push({
      name: 'SNAPSHOT_FRESHNESS',
      status: lastSnap
        ? snapAgeD < 2
          ? 'PASS'
          : snapAgeD < 7
            ? 'WARN'
            : 'FAIL'
        : 'WARN',
      message: lastSnap
        ? `Last snapshot ${snapAgeD.toFixed(1)}d ago`
        : 'No snapshots yet (run morning job or refresh portfolio)'
    })
  } catch {
    checks.push({ name: 'SNAPSHOT_FRESHNESS', status: 'WARN', message: 'Skip' })
  }

  // —— 9–12: sprint 2B CFO checks (fixed 12 total; trust /12) ——
  try {
    const tz = 'Europe/Prague'
    const d = new Date()
    const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const plan = await prisma.allocationPlan.findFirst({
      where: { monthYear, status: { in: ['PROPOSED', 'CONFIRMED', 'EXECUTED'] } },
      orderBy: { generatedAt: 'desc' }
    })
    const prof = await prisma.userProfile.findUnique({ where: { id: 'default' } })
    const sal = prof?.salaryDayOfMonth ?? 15
    const pragueNow = new Date(d.toLocaleString('en-US', { timeZone: tz }))
    const day = pragueNow.getDate()
    const pastSalary = day > sal

    let st: HealthRow['status'] = 'FAIL'
    let msg = 'No plan for ' + monthYear
    if (plan) {
      st = 'PASS'
      if (plan.status === 'PROPOSED') {
        const ageD = (Date.now() - plan.generatedAt.getTime()) / 86400000
        if (ageD > 5) st = 'WARN'
        msg = 'PROPOSED for ' + ageD.toFixed(0) + 'd'
      } else {
        msg = plan.status
      }
    } else if (!pastSalary) {
      st = 'WARN'
      msg = 'No plan yet; before salary+1 window'
    } else {
      st = 'FAIL'
      msg = 'No plan and past salary+1'
    }
    checks.push({ name: 'PLAN_COVERAGE', status: st, message: msg })
  } catch (e) {
    checks.push({ name: 'PLAN_COVERAGE', status: 'WARN', message: 'Skip' })
  }

  try {
    const d = new Date()
    const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const pragueNow = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Prague' }))
    const day = pragueNow.getDate()
    const plan = await prisma.allocationPlan.findFirst({
      where: { monthYear, status: { in: ['PROPOSED', 'CONFIRMED', 'EXECUTED'] } },
      orderBy: { generatedAt: 'desc' }
    })
    const rows = (plan?.allocations as unknown) as Array<{ executionStatus?: string }> | null
    if (!plan || !Array.isArray(rows) || rows.length === 0) {
      checks.push({ name: 'ADHERENCE_KNOWN', status: 'PASS', message: 'No rows / no plan' })
    } else if (day < 15) {
      checks.push({ name: 'ADHERENCE_KNOWN', status: 'PASS', message: 'Before mid-month' })
    } else {
      let n = 0
      let closed = 0
      for (const r of rows) {
        if (!isAdherenceRow(r)) continue
        n += 1
        const st = (r.executionStatus || 'PENDING').toUpperCase()
        if (st !== 'PENDING') closed += 1
      }
      const pct = n > 0 ? (closed / n) * 100 : 0
      let st: HealthRow['status'] = 'FAIL'
      if (pct > 50) st = 'PASS'
      else if (pct >= 25) st = 'WARN'
      checks.push({
        name: 'ADHERENCE_KNOWN',
        status: st,
        message: `${closed}/${n} rows not pending (${pct.toFixed(0)}%)`
      })
    }
  } catch {
    checks.push({ name: 'ADHERENCE_KNOWN', status: 'WARN', message: 'Skip' })
  }

  try {
    const sh = await prisma.systemHealth.findFirst({
      where: { OR: [{ checkName: 'WEEKLY_BACKUP' }, { checkName: { contains: 'BACKUP' } }] },
      orderBy: { checkedAt: 'desc' }
    })
    const journal = await prisma.advisorJournal.findFirst({
      where: { content: { contains: 'backup', mode: 'insensitive' } },
      orderBy: { date: 'desc' }
    })
    const tSh = sh?.lastSuccessful || sh?.checkedAt
    const tJ = journal?.date
    const best = tSh && tJ ? (tSh > tJ ? tSh : tJ) : tSh || tJ
    if (!best) {
      checks.push({ name: 'BACKUP_RECENT', status: 'FAIL', message: 'No backup log' })
    } else {
      const ageD = (Date.now() - new Date(best).getTime()) / 86400000
      const st: HealthRow['status'] = ageD < 7 ? 'PASS' : ageD < 14 ? 'WARN' : 'FAIL'
      checks.push({ name: 'BACKUP_RECENT', status: st, message: `${ageD.toFixed(0)}d since last` })
    }
  } catch {
    checks.push({ name: 'BACKUP_RECENT', status: 'WARN', message: 'Skip' })
  }

  try {
    const since = new Date(Date.now() - 24 * 3600000)
    const failN = await prisma.systemHealth.count({
      where: { checkName: 'AI_CALL_FAILURE', checkedAt: { gte: since } }
    })
    let aiSt: HealthRow['status'] = 'PASS'
    let aiMsg = `${failN} AI failure(s) in 24h`
    if (failN >= 4) aiSt = 'FAIL'
    else if (failN >= 1) aiSt = 'WARN'
    checks.push({ name: 'AI_RECENT_FAILURES', status: aiSt, message: aiMsg })
  } catch {
    checks.push({ name: 'AI_RECENT_FAILURES', status: 'WARN', message: 'Skip' })
  }

  try {
    const seven = new Date(Date.now() - 7 * 86400000)
    const fails = await prisma.cronExecution.count({
      where: { status: 'FAILED', startedAt: { gte: seven } }
    })
    const anyOk = await prisma.cronExecution.findFirst({
      where: { status: 'SUCCESS', startedAt: { gte: seven } }
    })
    let crSt: HealthRow['status'] = 'PASS'
    let crMsg = 'Cron ledger OK'
    if (fails >= 3) {
      crSt = 'FAIL'
      crMsg = `${fails} FAILED cron runs in 7d`
    } else if (!anyOk) {
      crSt = 'WARN'
      crMsg = 'No successful cron in 7d (new install or scheduler idle)'
    }
    checks.push({ name: 'CRON_HEALTH', status: crSt, message: crMsg })
  } catch {
    checks.push({ name: 'CRON_HEALTH', status: 'WARN', message: 'Skip' })
  }

  try {
    const u = process.memoryUsage()
    const ratio = u.heapTotal > 0 ? u.heapUsed / u.heapTotal : 0
    const st: HealthRow['status'] = ratio < 0.8 ? 'PASS' : ratio < 0.9 ? 'WARN' : 'FAIL'
    checks.push({
      name: 'MEMORY_HEALTHY',
      status: st,
      message: `heap ${(ratio * 100).toFixed(0)}%`
    })
  } catch {
    checks.push({ name: 'MEMORY_HEALTHY', status: 'WARN', message: 'Skip' })
  }

  const pass = checks.filter((c) => c.status === 'PASS').length
  const warn = checks.filter((c) => c.status === 'WARN').length
  const trustPct = Math.min(100, Math.round((pass * 100 + warn * 50) / HEALTH_CHECK_COUNT))

  return { checks, trustScore: trustPct }
}
