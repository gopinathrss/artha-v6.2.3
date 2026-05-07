import { getPrisma, realPrisma } from './prisma'
import { num } from './money'
import { isAdherenceRow } from './allocationRowTypes'
import { readPlanAllocationsOrEmpty } from './planAllocationsRead'
import { isSecretStoredSafely } from './secrets'
import { envAnthropicApiKey, envGeminiApiKey, envOpenaiApiKey } from './integrations/env-fallback'
import { FX_STALENESS_FAIL_HOURS, FX_STALENESS_WARN_HOURS, getFxAgeHours } from './currency'
import { getRbiRepoRate, getStalestNREFDAge } from './indiaIntelligence'

export type HealthRow = { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message?: string }

/** Spec target: named checks (trust score divides by this count). */
export const HEALTH_CHECK_COUNT = 18

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
    'STRATEGY_EVALUATOR',
    'MEMORY_HEALTHY',
    'RETENTION_POLICY'
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
    const activeHoldings = await prisma.holding.findMany({
      where: { status: 'ACTIVE' },
      select: { navSourceType: true, navLastFetchedAt: true }
    })
    const allNavFromErste =
      activeHoldings.length > 0 && activeHoldings.every((h) => h.navSourceType === 'ERSTE')
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
    let msg = nav
      ? `NavHistory ${navAgeDays.toFixed(1)}d; ERSTE/YAHOO/AMFI holdings max ${worstHoldDays.toFixed(1)}d since fetch`
      : 'No NavHistory yet'
    if (!nav && allNavFromErste) {
      st = 'WARN'
      msg =
        'NavHistory empty — expected for Erste-only portfolios. NAV sourced from Erste holding refresh, not Tier-2 history.'
    } else if (!nav && tracked.length === 0) {
      st = 'WARN'
    } else if (histStale || holdStale) {
      st = navAgeDays >= 14 || worstHoldDays > 10 ? 'FAIL' : 'WARN'
    }
    checks.push({
      name: 'NAV_FRESHNESS',
      status: st,
      message: msg
    })
  } catch {
    checks.push({ name: 'NAV_FRESHNESS', status: 'WARN', message: 'Skip' })
  }

  const s = await realPrisma.settings.findFirst()
  {
    let em: HealthRow['status'] = 'WARN'
    let emMsg = 'Not configured'
    if (s?.smtpUser && s.smtpPass) {
      if (!isSecretStoredSafely(s.smtpPass)) {
        em = 'WARN'
        emMsg = 'SMTP password stored as plaintext — re-save in Settings to encrypt'
      } else {
        em = 'PASS'
        emMsg = 'SMTP set (encrypted at rest)'
      }
    } else if (s?.smtpUser) {
      emMsg = 'SMTP user set but no password'
    }
    checks.push({ name: 'EMAIL_CONFIGURED', status: em, message: emMsg })
  }

  {
    const hasEnvAi = Boolean(envAnthropicApiKey() || envOpenaiApiKey() || envGeminiApiKey())
    const keyRaw = s?.openaiApiKey
    const hasSettingsKey = Boolean(keyRaw)
    let aiSt: HealthRow['status'] = hasEnvAi || hasSettingsKey ? 'PASS' : 'WARN'
    let aiMsg = 'Configure an AI provider under Integrations (or legacy env / Settings key)'
    try {
      const n = await realPrisma.integrationProvider.count({
        where: { category: 'ai', enabled: true }
      })
      if (n > 0) {
        aiSt = 'PASS'
        aiMsg = `${n} AI integration(s) enabled`
      }
    } catch {
      /* table missing */
    }
    if (hasSettingsKey && keyRaw && !isSecretStoredSafely(keyRaw)) {
      aiSt = 'WARN'
      aiMsg = 'OpenAI key in legacy Settings is plaintext — re-save to encrypt'
    }
    checks.push({ name: 'AI_REACHABLE', status: aiSt, message: aiMsg })
  }

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
        ? `${days}d stale · warn ≥30d · fail >60d (NRE FD validFrom)`
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
    const rows = plan ? await readPlanAllocationsOrEmpty(plan) : []
    if (!plan || rows.length === 0) {
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
    const since = new Date(Date.now() - 26 * 3600000)
    const last = await prisma.systemHealth.findFirst({
      where: { checkName: 'STRATEGY_EVALUATOR' },
      orderBy: { checkedAt: 'desc' }
    })
    if (!last) {
      checks.push({ name: 'STRATEGY_EVALUATOR', status: 'WARN', message: 'Never run' })
    } else if (last.checkedAt.getTime() < since.getTime()) {
      const ageH = (Date.now() - last.checkedAt.getTime()) / 3600000
      checks.push({
        name: 'STRATEGY_EVALUATOR',
        status: 'WARN',
        message: `Last run ${ageH.toFixed(0)}h ago (expected daily)`
      })
    } else {
      checks.push({
        name: 'STRATEGY_EVALUATOR',
        status: last.status === 'FAIL' ? 'WARN' : last.status === 'WARN' ? 'WARN' : 'PASS',
        message: last.message || 'OK'
      })
    }
  } catch {
    checks.push({ name: 'STRATEGY_EVALUATOR', status: 'WARN', message: 'Skip' })
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

  try {
    const ten = new Date(Date.now() - 10 * 86400000)
    const lastPrune = await prisma.cronExecution.findFirst({
      where: { jobName: 'prune-old-rows', status: 'SUCCESS', startedAt: { gte: ten } },
      orderBy: { startedAt: 'desc' }
    })
    const nextSunday = 'Sunday 03:00 Europe/Prague (weekly)'
    if (lastPrune) {
      checks.push({
        name: 'RETENTION_POLICY',
        status: 'PASS',
        message: `Last prune: ${lastPrune.startedAt.toISOString().slice(0, 10)}`
      })
    } else {
      checks.push({
        name: 'RETENTION_POLICY',
        status: 'WARN',
        message: `No successful prune in 10d — first run scheduled ${nextSunday}`
      })
    }
  } catch {
    checks.push({ name: 'RETENTION_POLICY', status: 'WARN', message: 'Skip' })
  }

  const pass = checks.filter((c) => c.status === 'PASS').length
  const warn = checks.filter((c) => c.status === 'WARN').length
  const trustPct = Math.min(100, Math.round((pass * 100 + warn * 50) / HEALTH_CHECK_COUNT))

  return { checks, trustScore: trustPct }
}
