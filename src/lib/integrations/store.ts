import type { IntegrationProvider, Prisma, PrismaClient } from '@prisma/client'
import { decrypt, encrypt, ENVELOPE_PREFIX, loadOrCreateKey } from '../secrets'
import { getPrisma } from '../prisma'
import { isProviderKey, PROVIDER_REGISTRY, type ProviderKey } from './registry'
import {
  envAnthropicApiKey,
  envExchangeRateApiKey,
  envGeminiApiKey,
  envOpenaiApiKey,
  envTelegramBotToken
} from './env-fallback'

function maskValue(v: string | null | undefined): string | null {
  if (v == null || v === '') return null
  if (v.startsWith(ENVELOPE_PREFIX)) {
    const tail = v.slice(-4)
    return `••••${tail}`
  }
  if (v.startsWith('sk-')) return `sk-••••${v.slice(-4)}`
  return '••••••'
}

export function decryptSecretsJson(
  secrets: Record<string, unknown> | null | undefined,
  key: Buffer
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!secrets || typeof secrets !== 'object') return out
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v !== 'string' || !v) continue
    if (!v.startsWith(ENVELOPE_PREFIX)) {
      throw new Error(`Secret "${k}" must be stored encrypted (enc:v1:). Re-save from UI.`)
    }
    out[k] = decrypt(v, key)
  }
  return out
}

export function maskSecretsJson(secrets: Record<string, unknown> | null | undefined): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  if (!secrets || typeof secrets !== 'object') return out
  for (const [k, v] of Object.entries(secrets)) {
    out[k] = typeof v === 'string' ? maskValue(v) : null
  }
  return out
}

export type IntegrationProviderListRow = Omit<IntegrationProvider, 'secrets'> & {
  secrets: Record<string, string | null>
}

export async function listIntegrationProviders(
  prisma: PrismaClient,
  category?: string
): Promise<IntegrationProviderListRow[]> {
  const rows = await prisma.integrationProvider.findMany({
    where: category ? { category } : undefined,
    orderBy: { key: 'asc' }
  })
  return rows.map((r) => ({
    ...r,
    secrets: maskSecretsJson(r.secrets as Record<string, unknown>)
  })) as never
}

export async function getProviderDecrypted(
  prisma: PrismaClient,
  key: string
): Promise<{ config: Record<string, unknown>; secrets: Record<string, string> } | null> {
  if (!isProviderKey(key)) return null
  const row = await prisma.integrationProvider.findUnique({ where: { key } })
  if (!row) return null
  const keyBuf = loadOrCreateKey()
  const cfg = (row.config && typeof row.config === 'object' ? row.config : {}) as Record<string, unknown>
  const sec = row.secrets as Record<string, unknown>
  return { config: cfg, secrets: decryptSecretsJson(sec, keyBuf) }
}

export async function upsertIntegrationProvider(
  prisma: PrismaClient,
  key: ProviderKey,
  data: {
    config?: Record<string, unknown>
    secrets?: Record<string, string | null>
    enabled?: boolean
    isDefault?: boolean
    label?: string
    notes?: string | null
  }
): Promise<void> {
  const meta = PROVIDER_REGISTRY[key]
  const keyBuf = loadOrCreateKey()
  const existing = await prisma.integrationProvider.findUnique({ where: { key } })
  const prevSecrets = (existing?.secrets as Record<string, unknown>) || {}
  const mergedSecrets: Record<string, string> = {}
  for (const f of meta.secretFields) {
    const incoming = data.secrets?.[f]
    if (incoming === undefined) {
      const prev = prevSecrets[f]
      if (typeof prev === 'string' && prev) mergedSecrets[f] = prev
      continue
    }
    if (incoming === null || incoming === '') continue
    if (typeof incoming === 'string' && incoming.startsWith('••')) continue
    mergedSecrets[f] = encrypt(incoming, keyBuf)
  }
  const cfg = {
    ...((existing?.config as object) || {}),
    ...(data.config || {})
  }
  const updatePayload: Prisma.IntegrationProviderUpdateInput = {}
  if (data.label !== undefined) updatePayload.label = data.label
  if (data.config !== undefined) updatePayload.config = cfg as object
  if (data.enabled !== undefined) updatePayload.enabled = data.enabled
  if (data.isDefault !== undefined) updatePayload.isDefault = data.isDefault
  if (data.notes !== undefined) updatePayload.notes = data.notes
  if (data.secrets !== undefined) {
    const merged: Record<string, string> = { ...(prevSecrets as Record<string, string>) }
    for (const [k, v] of Object.entries(mergedSecrets)) merged[k] = v
    updatePayload.secrets = merged as object
  }
  await prisma.integrationProvider.upsert({
    where: { key },
    create: {
      key,
      category: meta.category,
      label: data.label ?? meta.label,
      config: cfg as object,
      secrets: mergedSecrets as object,
      enabled: data.enabled ?? false,
      isDefault: data.isDefault ?? false,
      notes: data.notes ?? null
    },
    update: updatePayload
  })
}

export async function deleteIntegrationProvider(prisma: PrismaClient, key: string, hard = false): Promise<void> {
  if (!isProviderKey(key)) throw new Error('Unknown provider key')
  if (hard) {
    await prisma.integrationProvider.delete({ where: { key } })
  } else {
    await prisma.integrationProvider.update({
      where: { key },
      data: { enabled: false, secrets: {}, config: {} }
    })
  }
}

let bootstrapDone = false

/** One-shot: seed IntegrationProvider rows from .env when DB has no secrets (logged to SystemHealth).
 *  V6: pass `realPrisma` explicitly at boot so demo mode never receives env-derived secrets. */
export async function bootstrapIntegrationsFromEnvIfNeeded(db?: PrismaClient): Promise<void> {
  if (bootstrapDone) return
  bootstrapDone = true
  const prisma = db ?? (await getPrisma())
  const logBootstrap = async (msg: string) => {
    try {
      await prisma.systemHealth.create({
        data: {
          checkName: 'SECRETS_BOOTSTRAP',
          status: 'WARN',
          message: msg
        }
      })
    } catch {
      /* */
    }
  }

  const ensureAi = async (
    k: ProviderKey,
    envVal: string,
    extra: { model?: string } = {}
  ) => {
    if (!envVal) return
    const row = await prisma.integrationProvider.findUnique({ where: { key: k } })
    const sec = row?.secrets as Record<string, string> | undefined
    if (sec && typeof sec.apiKey === 'string' && sec.apiKey.startsWith(ENVELOPE_PREFIX)) return
    if (row && sec && Object.keys(sec).length > 0) return
    await upsertIntegrationProvider(prisma, k, {
      enabled: true,
      secrets: { apiKey: envVal },
      config: { model: extra.model || (k === 'ai.openai' ? 'gpt-4o' : k === 'ai.gemini' ? 'gemini-1.5-pro' : 'claude-3-5-sonnet-20241022') }
    })
    await logBootstrap(`Loaded ${k} API key from .env; re-save in Integrations UI to confirm at-rest encryption.`)
  }

  await ensureAi('ai.anthropic', envAnthropicApiKey())
  await ensureAi('ai.openai', envOpenaiApiKey())
  await ensureAi('ai.gemini', envGeminiApiKey())

  const tg = envTelegramBotToken()
  if (tg) {
    const row = await prisma.integrationProvider.findUnique({ where: { key: 'comms.telegram' } })
    const sec = row?.secrets as Record<string, string> | undefined
    if (!sec?.botToken?.startsWith?.(ENVELOPE_PREFIX)) {
      if (!row || !sec?.botToken) {
        await upsertIntegrationProvider(prisma, 'comms.telegram', { enabled: true, secrets: { botToken: tg } })
        await logBootstrap('Loaded comms.telegram token from .env; re-save in Integrations UI.')
      }
    }
  }

  const fx = envExchangeRateApiKey()
  if (fx) {
    const row = await prisma.integrationProvider.findUnique({ where: { key: 'fx.exchangerate-api' } })
    const sec = row?.secrets as Record<string, string> | undefined
    if (!sec?.apiKey?.startsWith?.(ENVELOPE_PREFIX)) {
      if (!row || !sec?.apiKey) {
        await upsertIntegrationProvider(prisma, 'fx.exchangerate-api', { enabled: true, secrets: { apiKey: fx } })
        await logBootstrap('Loaded fx.exchangerate-api key from .env; re-save in Integrations UI.')
      }
    }
  }

  try {
    const appRow = await prisma.appSettings.findUnique({ where: { id: 'default' } })
    if (appRow?.defaultAiProviderKey) {
      const { syncAiIntegrationRowsToActive } = await import('./singleActiveAi')
      await syncAiIntegrationRowsToActive(prisma, appRow.defaultAiProviderKey)
    }
  } catch {
    /* AppSettings missing until migration */
  }
}
