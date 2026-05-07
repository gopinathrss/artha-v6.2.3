import type { Express, Request } from 'express'
import { realPrisma } from '../lib/prisma'
import { isProviderKey, PROVIDER_REGISTRY, type ProviderKey } from '../lib/integrations/registry'
import {
  deleteIntegrationProvider,
  listIntegrationProviders,
  upsertIntegrationProvider
} from '../lib/integrations/store'
import { recentIntegrationStatus } from '../lib/integrations/status'
import { runIntegrationProviderTest } from '../lib/integrations/testRunner'
import { auditSettingsChange } from '../lib/audit'
import { ensureAppSettings } from '../lib/appSettingsMerge'
import { syncAiIntegrationRowsToActive } from '../lib/integrations/singleActiveAi'

const testHits: Record<string, { n: number; start: number }> = {}

const TEST_RATE_MAX: Record<string, number> = {
  'comms.smtp': 20,
  'comms.imap': 20,
  'comms.telegram': 20,
  default: 5
}

function rateLimitMaxForKey(key: string): number {
  return TEST_RATE_MAX[key] ?? TEST_RATE_MAX.default
}

function rateLimitTest(key: string, req: Request): boolean {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local')
  const id = `${ip}:${key}`
  const now = Date.now()
  const w = testHits[id] || { n: 0, start: now }
  if (now - w.start > 300_000) {
    w.n = 0
    w.start = now
  }
  w.n += 1
  testHits[id] = w
  return w.n <= rateLimitMaxForKey(key)
}

export function registerIntegrationsRoutes(app: Express): void {
  app.get('/api/integrations', async (req, res) => {
    try {
      const cat = typeof req.query.category === 'string' ? req.query.category : undefined
      const list = await listIntegrationProviders(realPrisma, cat)
      res.json({ success: true, data: { providers: list } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.get('/api/integrations/:key', async (req, res) => {
    try {
      const key = req.params.key
      if (!isProviderKey(key)) return res.status(400).json({ success: false, error: 'Unknown provider' })
      const list = await listIntegrationProviders(realPrisma)
      const row = list.find((r) => r.key === key)
      if (!row) return res.status(404).json({ success: false, error: 'Not found' })
      res.json({ success: true, data: { provider: row } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/integrations/:key', async (req, res) => {
    try {
      const key = req.params.key as ProviderKey
      if (!isProviderKey(key)) return res.status(400).json({ success: false, error: 'Unknown provider' })
      const body = (req.body || {}) as {
        config?: Record<string, unknown>
        secrets?: Record<string, string | null>
        enabled?: boolean
        isDefault?: boolean
        label?: string
        notes?: string | null
      }
      const before = await realPrisma.integrationProvider.findUnique({ where: { key } })
      await upsertIntegrationProvider(realPrisma, key, {
        config: body.config,
        secrets: body.secrets,
        enabled: body.enabled,
        isDefault: body.isDefault,
        label: body.label,
        notes: body.notes
      })
      const after = await realPrisma.integrationProvider.findUnique({ where: { key } })
      await auditSettingsChange(realPrisma, {
        path: `IntegrationProvider:${key}`,
        before,
        after: { ...after, secrets: '[masked]' }
      })
      res.json({ success: true, data: { saved: true } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.delete('/api/integrations/:key', async (req, res) => {
    try {
      const key = req.params.key
      if (!isProviderKey(key)) return res.status(400).json({ success: false, error: 'Unknown provider' })
      const hard = req.query.hard === '1' || req.query.hard === 'true'
      await deleteIntegrationProvider(realPrisma, key, hard)
      res.json({ success: true, data: { deleted: true, hard } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/integrations/:key/test', async (req, res) => {
    try {
      const key = req.params.key as ProviderKey
      if (!isProviderKey(key)) return res.status(400).json({ success: false, error: 'Unknown provider' })
      if (!rateLimitTest(key, req)) {
        const mx = rateLimitMaxForKey(key)
        return res.status(429).json({
          success: false,
          error: `Rate limit: ${mx} tests per 5 minutes for this integration`
        })
      }
      const r = await runIntegrationProviderTest(realPrisma, key)
      res.json({ success: true, data: r })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.post('/api/integrations/:key/set-default', async (req, res) => {
    try {
      const key = req.params.key as ProviderKey
      if (!isProviderKey(key)) return res.status(400).json({ success: false, error: 'Unknown provider' })
      const meta = PROVIDER_REGISTRY[key]
      if (meta.category !== 'ai') return res.status(400).json({ success: false, error: 'Only AI providers' })
      await ensureAppSettings(realPrisma)
      await realPrisma.appSettings.update({
        where: { id: 'default' },
        data: { defaultAiProviderKey: key }
      })
      await syncAiIntegrationRowsToActive(realPrisma, key)
      res.json({ success: true, data: { defaultAiProviderKey: key } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })

  app.get('/api/integrations/:key/status', async (req, res) => {
    try {
      const key = req.params.key
      if (!isProviderKey(key)) return res.status(400).json({ success: false, error: 'Unknown provider' })
      const n = Math.min(50, Math.max(1, parseInt(String(req.query.n || '10'), 10) || 10))
      const rows = await recentIntegrationStatus(realPrisma, key, n)
      res.json({ success: true, data: { status: rows } })
    } catch (e: unknown) {
      res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}
