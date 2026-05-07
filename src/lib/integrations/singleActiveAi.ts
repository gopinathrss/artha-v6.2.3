import type { PrismaClient } from '@prisma/client'

export const AI_INTEGRATION_KEYS = ['ai.openai', 'ai.anthropic', 'ai.gemini'] as const

/** Keep IntegrationProvider.enabled / isDefault aligned with AppSettings.defaultAiProviderKey (single active AI). */
export async function syncAiIntegrationRowsToActive(prisma: PrismaClient, activeKey: string | null): Promise<void> {
  const k = activeKey && activeKey.length > 0 ? activeKey : null
  if (k != null && !(AI_INTEGRATION_KEYS as readonly string[]).includes(k)) {
    throw new Error('defaultAiProviderKey must be ai.openai, ai.anthropic, ai.gemini, or null')
  }

  for (const key of AI_INTEGRATION_KEYS) {
    const on = k !== null && key === k
    await prisma.integrationProvider.updateMany({
      where: { key },
      data: { enabled: on, isDefault: on }
    })
  }

  const leg = await prisma.settings.findFirst({ orderBy: { createdAt: 'asc' } })
  if (leg) {
    const legacyAi =
      k === 'ai.anthropic' ? 'anthropic' : k === 'ai.gemini' ? 'gemini' : k === 'ai.openai' ? 'openai' : 'openai'
    await prisma.settings.update({
      where: { id: leg.id },
      data: { aiProvider: legacyAi }
    })
  }
}
