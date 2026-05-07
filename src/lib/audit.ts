import type { PrismaClient } from '@prisma/client'

export async function auditSettingsChange(
  prisma: PrismaClient,
  opts: { path: string; before: unknown; after: unknown }
): Promise<void> {
  const redact = (v: unknown) => {
    const s = JSON.stringify(v)
    if (/apiKey|password|token|secret/i.test(s)) return '[redacted]'
    return s
  }
  try {
    await prisma.advisorJournal.create({
      data: {
        category: 'SETTINGS_AUDIT',
        content: `${opts.path} updated`,
        metadata: {
          path: opts.path,
          before: redact(opts.before),
          after: redact(opts.after)
        } as object
      }
    })
  } catch {
    /* */
  }
}
