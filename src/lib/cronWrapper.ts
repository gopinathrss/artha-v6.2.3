import { getPrisma } from './prisma'

/**
 * Records each cron run in `CronExecution` for observability (F12.4).
 * Swallows errors after logging so the scheduler keeps running.
 */
export async function runCronJob<T>(
  jobName: string,
  fn: () => Promise<T>,
  metadata?: object
): Promise<T | null> {
  const prisma = await getPrisma()
  const scheduledFor = new Date()
  const exec = await prisma.cronExecution.create({
    data: {
      jobName,
      scheduledFor,
      startedAt: scheduledFor,
      status: 'RUNNING',
      metadata: metadata ?? undefined
    }
  })

  try {
    const t0 = Date.now()
    const result = await fn()
    const durationMs = Date.now() - t0
    const itemsProcessed =
      result && typeof result === 'object' && 'itemsProcessed' in result && typeof (result as any).itemsProcessed === 'number'
        ? (result as { itemsProcessed: number }).itemsProcessed
        : null

    await prisma.cronExecution.update({
      where: { id: exec.id },
      data: {
        completedAt: new Date(),
        status: 'SUCCESS',
        durationMs,
        itemsProcessed
      }
    })
    return result ?? null
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e))
    await prisma.cronExecution.update({
      where: { id: exec.id },
      data: {
        completedAt: new Date(),
        status: 'FAILED',
        errors: { message: err.message, stack: err.stack?.slice(0, 2000) } as object
      }
    })
    // eslint-disable-next-line no-console
    console.error(`[Cron ${jobName}] FAILED:`, err.message)
    return null
  }
}
