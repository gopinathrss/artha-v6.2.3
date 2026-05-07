import { getPrisma } from '../prisma'

/**
 * DEDUP WINDOW — not a physical delete TTL.
 * Dismissed alerts older than this are eligible to fire again
 * (their dismissed state is no longer honoured).
 * Rows themselves persist until dismissed-alert pruning in `src/lib/cron/pruneOldRows.ts`
 * (`alertLogDismissedRetentionDays`, default 90d) removes old DISMISSED rows.
 */
const DISMISS_RETENTION_MS = 30 * 86400000

export function alertKeyForTrigger(tr: { triggerType: string; dataSnapshot?: unknown }): string {
  if (tr.triggerType === 'TAX_FREE_APPROACHING') {
    const id = (tr.dataSnapshot as { holdingId?: string } | undefined)?.holdingId
    return id ? `tax-window:${id}` : 'tax-window:unknown'
  }
  if (tr.triggerType === 'ALLOCATION_DRIFT') return 'drift:equity'
  return `trigger:${tr.triggerType}`
}

export async function fireAlertWithDedup(opts: {
  alertKey: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  category: string
  message: string
  title?: string
  metadata?: unknown
}): Promise<{ created: boolean; alertId: string }> {
  const prisma = await getPrisma()
  const cutoff = new Date(Date.now() - DISMISS_RETENTION_MS)

  const existing = await prisma.alertLog.findFirst({
    where: {
      alertKey: opts.alertKey,
      OR: [{ status: 'ACTIVE' }, { status: 'DISMISSED', dismissedAt: { gte: cutoff } }]
    },
    orderBy: { lastFiredAt: 'desc' }
  })

  const urgency =
    opts.severity === 'CRITICAL'
      ? 'CRITICAL'
      : opts.severity === 'HIGH'
        ? 'HIGH'
        : opts.severity === 'LOW'
          ? 'INFO'
          : 'MEDIUM'

  if (existing?.status === 'DISMISSED') {
    await prisma.alertLog.update({
      where: { id: existing.id },
      data: {
        lastFiredAt: new Date(),
        fireCount: { increment: 1 },
        message: opts.message,
        title: opts.title ?? existing.title
      }
    })
    return { created: false, alertId: existing.id }
  }

  if (existing && existing.status === 'ACTIVE') {
    await prisma.alertLog.update({
      where: { id: existing.id },
      data: {
        lastFiredAt: new Date(),
        fireCount: { increment: 1 },
        message: opts.message,
        title: opts.title ?? existing.title,
        dataSnapshot: (opts.metadata ?? existing.dataSnapshot) as object
      }
    })
    return { created: false, alertId: existing.id }
  }

  const now = new Date()
  const created = await prisma.alertLog.create({
    data: {
      alertKey: opts.alertKey,
      triggerType: opts.category,
      title: opts.title ?? opts.category,
      message: opts.message,
      urgency,
      dataSnapshot: (opts.metadata ?? {}) as object,
      status: 'ACTIVE',
      fireCount: 1,
      firstFiredAt: now,
      lastFiredAt: now,
      firedAt: now
    }
  })
  return { created: true, alertId: created.id }
}

export async function resolveAlert(alertKey: string): Promise<void> {
  const prisma = await getPrisma()
  await prisma.alertLog.updateMany({
    where: { alertKey, status: 'ACTIVE' },
    data: { status: 'RESOLVED', resolvedAt: new Date() }
  })
}

/** Resolves ACTIVE tax-window / drift alerts whose keys are not in the active set. */
export async function resolveInactiveTriggerAlerts(activeKeys: Set<string>): Promise<void> {
  const prisma = await getPrisma()
  const candidates = await prisma.alertLog.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ alertKey: { startsWith: 'tax-window:' } }, { alertKey: 'drift:equity' }]
    },
    select: { alertKey: true }
  })
  for (const c of candidates) {
    if (!activeKeys.has(c.alertKey)) {
      await resolveAlert(c.alertKey)
    }
  }
}
