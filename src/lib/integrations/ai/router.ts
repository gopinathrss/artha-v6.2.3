import { realPrisma } from '../../prisma'
import { ensureAppSettings, getMergedSettings } from '../../appSettingsMerge'
import { getProviderDecrypted } from '../store'
import { writeIntegrationStatus } from '../status'
import { envAnthropicModel } from '../env-fallback'
import type { AiAskParams, AiAskResult } from './types'
import { anthropicProvider } from './anthropic'
import { openaiProvider } from './openai'
import { geminiProvider } from './gemini'

const CHAIN: Array<{ key: 'ai.anthropic' | 'ai.openai' | 'ai.gemini'; impl: typeof anthropicProvider; defModel: string }> = [
  { key: 'ai.anthropic', impl: anthropicProvider, defModel: envAnthropicModel() },
  { key: 'ai.openai', impl: openaiProvider, defModel: 'gpt-4o' },
  { key: 'ai.gemini', impl: geminiProvider, defModel: 'gemini-1.5-flash' }
]

/**
 * Single-active model: when `defaultAiProviderKey` is set, only that integration is used (no silent fallback to other AI keys).
 * When unset, try all providers in registry order (legacy / migration).
 */
function providersToTry(defaultKey: string | null | undefined): typeof CHAIN {
  if (!defaultKey) return CHAIN
  const row = CHAIN.filter((c) => c.key === defaultKey)
  return row.length ? row : CHAIN
}

/**
 * Picks enabled providers with keys; logs IntegrationStatus per attempt.
 */
export async function aiRouterAsk(params: AiAskParams): Promise<AiAskResult> {
  await ensureAppSettings(realPrisma)
  const app = await getMergedSettings(realPrisma)
  const ordered = providersToTry(app.defaultAiProviderKey || undefined)
  const prisma = realPrisma

  for (const { key, impl, defModel } of ordered) {
    const row = await prisma.integrationProvider.findUnique({ where: { key } })
    if (!row?.enabled) continue
    const dec = await getProviderDecrypted(prisma, key)
    const apiKey = dec?.secrets?.apiKey
    if (!apiKey) continue
    const model = String(dec.config?.model || defModel)
    const t0 = Date.now()
    try {
      const out = await impl.ask(params, apiKey, model)
      const latencyMs = Date.now() - t0
      await writeIntegrationStatus(prisma, {
        providerKey: key,
        status: 'OK',
        source: 'live-call',
        message: `${impl.name} OK`,
        metadata: { model: out.model, inputTokens: out.inputTokens, outputTokens: out.outputTokens },
        latencyMs
      })
      return out
    } catch (e: unknown) {
      const latencyMs = Date.now() - t0
      const msg = e instanceof Error ? e.message : String(e)
      await writeIntegrationStatus(prisma, {
        providerKey: key,
        status: 'FAIL',
        source: 'live-call',
        message: msg,
        metadata: { model },
        latencyMs
      })
    }
  }

  throw new Error('No enabled AI provider with a valid API key. Configure Integrations or set .env fallback once.')
}
