import type { PrismaClient } from '@prisma/client'

/** Every `runCronJob` name registered in `scheduler.ts` — keep in sync when adding crons. */
export const REGISTERED_CRON_JOB_NAMES = [
  'fx-refresh-weekday',
  'morning-job-weekday',
  'daily-snapshot',
  'evaluate-strategies',
  'monitor-profit-caps',
  'monthly-letter',
  'weekly-backup',
  'eom-journal',
  'salary-auto-plan',
  'daily-digest',
  'amfi-navall-ingest',
  'nav-refresh-czech',
  'library-scores-monthly',
  'outcome-evaluation-daily',
  'email-ingestion',
  'historical-nav-refresh-quarterly',
  'monthly-report-smart',
  'quarterly-report-smart',
  'tax-year-report-smart',
  'prune-old-rows'
] as const

/**
 * If a job has never written to `CronExecution`, insert a SCHEDULED placeholder
 * so ops can distinguish “registered, not yet run” from a missing registration (F6.2).
 */
export async function ensureCronJobPlaceholders(prisma: PrismaClient): Promise<void> {
  const now = new Date()
  for (const jobName of REGISTERED_CRON_JOB_NAMES) {
    const exists = await prisma.cronExecution.findFirst({ where: { jobName } })
    if (exists) continue
    await prisma.cronExecution.create({
      data: {
        jobName,
        scheduledFor: now,
        startedAt: now,
        status: 'SCHEDULED',
        metadata: {
          note: 'Placeholder — job registered but not yet run'
        } as object
      }
    })
  }
}
