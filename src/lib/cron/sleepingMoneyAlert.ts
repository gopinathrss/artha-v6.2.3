import type { PrismaClient } from '@prisma/client'
import { fireAlertWithDedup } from '../alerts/dedup'
import type { SleepingMoneyReport } from '../intelligence/sleepingMoneyEngine'

const ALERT_KEY = 'SLEEPING_MONEY'
const SUPPRESS_MS = 7 * 86400000

function mapSeverity(level: SleepingMoneyReport['alertLevel']): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (level === 'CRITICAL') return 'CRITICAL'
  if (level === 'WARN') return 'HIGH'
  if (level === 'INFO') return 'MEDIUM'
  return 'LOW'
}

/** Fire at most one sleeping-money alert per 7 days (Phase 1). */
export async function maybeFireSleepingMoneyAlert(
  prisma: PrismaClient,
  report: SleepingMoneyReport
): Promise<void> {
  if (report.alertLevel === 'NONE') return

  const weekAgo = new Date(Date.now() - SUPPRESS_MS)
  const recent = await prisma.alertLog.findFirst({
    where: { alertKey: ALERT_KEY, lastFiredAt: { gte: weekAgo } },
    orderBy: { lastFiredAt: 'desc' }
  })
  if (recent) return

  await fireAlertWithDedup({
    alertKey: ALERT_KEY,
    severity: mapSeverity(report.alertLevel),
    category: 'SLEEPING_MONEY',
    title: `${Math.round(report.totalSleepingCzk).toLocaleString('cs-CZ')} Kč sleeping`,
    message: report.summary,
    metadata: {
      totalSleepingCzk: report.totalSleepingCzk,
      annualRealLossCzk: report.totalAnnualRealLossCzk,
      alertLevel: report.alertLevel,
      ideas: report.deployableIdeas
    }
  })
}
