import type { PrismaClient } from '@prisma/client'
import { getMergedSettings } from '../appSettingsMerge'

function subDays(d: Date, days: number): Date {
  return new Date(d.getTime() - days * 86400000)
}

export type PruneResult = {
  cronDeleted: number
  healthDeleted: number
  emailDeleted: number
  alertDeleted: number
  cutoffs: { cronCutoff: Date; healthCutoff: Date; emailCutoff: Date; alertCutoff: Date }
}

/**
 * TTL pruning for high-volume tables (F11.1). Retention days come from AppSettings (merged).
 * Dismissed AlertLog rows older than `alertLogDismissedRetentionDays` are removed (F11.2).
 */

export async function pruneOldRows(prisma: PrismaClient): Promise<PruneResult> {
  const merged = await getMergedSettings(prisma)
  const cronDays = merged.cronExecutionRetentionDays
  const healthDays = merged.systemHealthRetentionDays
  const emailDays = merged.emailPreviewRetentionDays
  const alertDays = merged.alertLogDismissedRetentionDays

  const now = new Date()
  const cronCutoff = subDays(now, cronDays)
  const healthCutoff = subDays(now, healthDays)
  const emailCutoff = subDays(now, emailDays)
  const alertCutoff = subDays(now, alertDays)

  const [cronDeleted, healthDeleted, emailDeleted, alertDeleted] = await Promise.all([
    prisma.cronExecution.deleteMany({
      where: { scheduledFor: { lt: cronCutoff } }
    }),
    prisma.systemHealth.deleteMany({
      where: { checkedAt: { lt: healthCutoff } }
    }),
    prisma.emailIngestionPreview.deleteMany({
      where: {
        createdAt: { lt: emailCutoff },
        status: { in: ['APPROVED', 'REJECTED', 'AUTO_INGESTED'] }
      }
    }),
    prisma.alertLog.deleteMany({
      where: {
        status: 'DISMISSED',
        AND: [{ dismissedAt: { not: null } }, { dismissedAt: { lt: alertCutoff } }]
      }
    })
  ])

  return {
    cronDeleted: cronDeleted.count,
    healthDeleted: healthDeleted.count,
    emailDeleted: emailDeleted.count,
    alertDeleted: alertDeleted.count,
    cutoffs: { cronCutoff, healthCutoff, emailCutoff, alertCutoff }
  }
}
