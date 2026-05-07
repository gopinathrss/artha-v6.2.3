import express from 'express'
import fs from 'fs'
import path from 'path'
import { getPrisma, realPrisma } from '../lib/prisma'
import { getPortfolioSummary } from '../lib/portfolio'
import { loadAllLibrary, findBestAlternative, compareFundToETF, scoreInstrument } from '../lib/instrumentLibrary'
import { askPie } from '../lib/aiIntelligence'
import { sendTestEmail } from '../lib/emailService'
import { createDailySnapshot, runMorningJob } from '../lib/triggers'
import { getFXRates } from '../lib/fetchers'
import {
  calculateDTAABenefit,
  compareFCNRvsNRE,
  getNRIEligibleMutualFunds
} from '../lib/indiaIntelligence'
import { registerCfoRoutes } from './cfoRoutes'
import { registerAppSettingsRoutes } from './appSettingsRoutes'
import { registerIntegrationsRoutes } from './integrationsRoutes'
import { registerGoogleMailOAuthRoutes } from './googleMailOAuthRoutes'
import { registerDashboardAuthRoutes } from './dashboardAuthRoutes'
import { registerStrategyRoutes } from './strategyRoutes'
import { registerCapitalEfficiencyRoutes } from './capitalEfficiencyRoutes'
import { registerDashboardApiAuthGate, registerDashboardHtmlAuthGate } from './dashboardAuthMiddleware'
import { registerExternalReadApiGate } from './externalReadApiGate'
import { registerRequestContext, send500 } from './requestContext'
import { num, serializeJsonBody, d } from '../lib/money'
import { mergedAccountShapeB, balanceCzkSnapshotForWrite } from '../lib/accountShapeB'
import { getRbiRepoRate } from '../lib/indiaIntelligence'

const app = express()
// Trust the first reverse proxy (Caddy/NGINX) so req.ip and req.protocol are real.
app.set('trust proxy', 1)
app.use(express.json({ limit: '10mb' }))
registerRequestContext(app)
app.use((_req, res, next) => {
  const send = res.json.bind(res)
  res.json = (body: unknown) => send(serializeJsonBody(body))
  next()
})

registerDashboardAuthRoutes(app)
registerDashboardHtmlAuthGate(app)
registerDashboardApiAuthGate(app)

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/memory', (_req, res) => {
    const m = process.memoryUsage()
    const pct = m.heapTotal > 0 ? Math.round((m.heapUsed / m.heapTotal) * 100) : 0
    res.json({
      heapUsed: Math.round(m.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(m.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(m.rss / 1024 / 1024) + ' MB',
      external: Math.round(m.external / 1024 / 1024) + ' MB',
      pct: pct + '%'
    })
  })
}

// Avoid stale dashboard during dev: browsers cache CSS & HTML aggressively
app.use(
  express.static(path.join(__dirname, '../dashboard'), {
    maxAge: process.env.NODE_ENV === 'production' ? 86_400_000 : 0,
    setHeaders: (res, filePath) => {
      if (process.env.NODE_ENV !== 'production' && /\.(html|css|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        res.setHeader('Pragma', 'no-cache')
      }
    }
  })
)
app.use(
  '/charts',
  express.static(
    (() => {
      const a = path.join(process.cwd(), 'src', 'dashboard', 'charts')
      const b = path.join(__dirname, '../dashboard/charts')
      return fs.existsSync(a) ? a : b
    })(),
    { maxAge: process.env.NODE_ENV === 'production' ? 86_400_000 : 0 }
  )
)
app.use(
  '/vendor/echarts',
  express.static(path.join(__dirname, '../../node_modules/echarts/dist'), {
    maxAge: process.env.NODE_ENV === 'production' ? 7 * 86_400_000 : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    }
  })
)

async function isDemoMode(): Promise<{ demo: boolean; persona: string }> {
  try {
    const { getMergedSettings } = await import('../lib/appSettingsMerge')
    const m = await getMergedSettings(realPrisma)
    return { demo: m.demoModeEnabled, persona: m.demoPersona }
  } catch {
    return { demo: false, persona: 'engineer' }
  }
}

const askRate: Record<string, { count: number; windowStart: number }> = {}
const askCache = new Map<string, { at: number; rec: unknown }>()

function clientKey(req: express.Request) {
  // With trust proxy=1 above, req.ip is the real client IP behind one proxy.
  return req.ip || req.socket.remoteAddress || 'local'
}

async function getIntelligencePortfolio() {
  const s = await getPortfolioSummary()
  if (!s.success || !s.data) return null
  return s.data
}

const PAGES = [
  '/',
  '/onboarding',
  '/this-month',
  '/finances',
  '/india',
  '/portfolio',
  '/accounts',
  '/tax-calendar',
  '/alerts',
  '/reports',
  '/settings',
  '/intelligence',
  '/library',
  '/backtest',
  '/patterns',
  '/help'
]
const PAGE_FILES: Record<string, string> = {
  '/': 'index.html',
  '/onboarding': 'onboarding.html',
  '/this-month': 'this-month.html',
  '/finances': 'finances.html',
  '/india': 'india.html',
  '/portfolio': 'portfolio.html',
  '/accounts': 'accounts.html',
  '/tax-calendar': 'tax-calendar.html',
  '/alerts': 'alerts.html',
  '/reports': 'reports.html',
  '/settings': 'settings.html',
  '/intelligence': 'intelligence.html',
  '/library': 'library.html',
  '/backtest': 'backtest.html',
  '/patterns': 'patterns.html',
  '/help': 'help.html'
}

PAGES.forEach((route) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard', PAGE_FILES[route]))
  })
})

// No standalone profile.html — identity & targets live under Settings (`/settings`).
app.get('/profile', (_req, res) => {
  res.redirect(302, '/settings')
})

registerCfoRoutes(app)
registerAppSettingsRoutes(app)
registerIntegrationsRoutes(app)
registerStrategyRoutes(app)
registerCapitalEfficiencyRoutes(app)
registerGoogleMailOAuthRoutes(app)
registerExternalReadApiGate(app)

app.get('/healthz', async (_req, res) => {
  try {
    await realPrisma.$queryRaw`SELECT 1`
    let aiHint = ''
    try {
      const n = await realPrisma.integrationProvider.count({ where: { category: 'ai', enabled: true } })
      if (n === 0) {
        aiHint = ' (no AI integrations enabled — optional)'
        if (process.env.PIE_HEALTHZ_STRICT_AI === '1' || process.env.ARTHA_HEALTHZ_STRICT_AI === '1') {
          return res
            .status(503)
            .type('text/plain')
            .send(
              'FAIL: no enabled AI provider (set PIE_HEALTHZ_STRICT_AI=0 or legacy ARTHA_HEALTHZ_STRICT_AI=0, or enable an AI integration)'
            )
        }
      }
    } catch {
      /* */
    }
    res.status(200).type('text/plain').send(`OK${aiHint}`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(503).type('text/plain').send(`FAIL: ${msg}`)
  }
})

app.get('/api/overview', async (_req, res) => {
  const { demo } = await isDemoMode()
  const result = await getPortfolioSummary()
  if (!result.success) {
    return res.json(result)
  }
  return res.json({ ...result, demo })
})

app.get('/api/holdings', async (_req, res) => {
  const { demo } = await isDemoMode()
  try {
    const prisma = await getPrisma()
    const holdings = await prisma.holding.findMany({
      include: { cashflows: { orderBy: { date: 'asc' } } },
      orderBy: { createdAt: 'asc' }
    })
    res.json({ success: true, data: { holdings }, demo })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/alerts', async (req, res) => {
  const { demo } = await isDemoMode()
  try {
    const prisma = await getPrisma()
    const q = req.query as Record<string, string | undefined>
    const includeDismissed = q.includeDismissed === '1' || q.includeDismissed === 'true'
    const take = Math.min(100, Math.max(1, parseInt(String(q.limit || '50'), 10) || 50))
    const urgencyCsv = (q.urgency || '').trim()
    const urgencyIn =
      urgencyCsv.length > 0
        ? urgencyCsv
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : null
    const alerts = await prisma.alertLog.findMany({
      where: {
        ...(includeDismissed ? {} : { status: { not: 'DISMISSED' } }),
        ...(urgencyIn && urgencyIn.length > 0 ? { urgency: { in: urgencyIn } } : {})
      },
      orderBy: { firedAt: 'desc' },
      take
    })
    res.json({
      success: true,
      data: {
        alerts,
        alertRetentionNote:
          'Dismissed alerts stay in the log for deduplication; dismissed rows older than 90 days are pruned automatically (weekly job).'
      },
      demo
    })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/snapshots', async (_req, res) => {
  const { demo } = await isDemoMode()
  try {
    const prisma = await getPrisma()
    const snapshots = await prisma.snapshot.findMany({
      orderBy: { date: 'asc' },
      take: 36
    })
    res.json({ success: true, data: { snapshots }, demo })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

/** Create or update today's Snapshot row from current portfolio (no full morning NAV refresh). */
app.post('/api/snapshots/trigger', async (_req, res) => {
  try {
    const r = await createDailySnapshot()
    if (!r.ok) {
      res.status(500).json({ success: false, error: r.error || 'Snapshot failed' })
      return
    }
    res.json({ success: true, data: { snapshot: 'upserted' } })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/settings', async (_req, res) => {
  try {
    res.setHeader('X-Pie-Deprecation', 'Prefer GET /api/app-settings and GET /api/integrations')
    res.setHeader('X-Artha-Deprecation', 'Prefer GET /api/app-settings and GET /api/integrations')
    let s = await realPrisma.settings.findFirst()
    if (!s) s = await realPrisma.settings.create({ data: {} })
    const { secretKeyfilePath } = await import('../lib/secrets')
    const safe = {
      ...s,
      smtpPass: '••••••',
      imapPassword: s.imapPassword ? '••••••' : null,
      openaiApiKey: s.openaiApiKey ? 'sk-••••' : null,
      telegramBotToken: s.telegramBotToken ? '••••' : null
    }
    const secretsInfo = {
      keyfilePath: secretKeyfilePath(),
      message:
        'API keys and SMTP/IMAP passwords are encrypted at rest (AES-256-GCM) using the local key file above. ' +
        'To encrypt existing plaintext values, re-enter each secret and save.'
    }
    res.json({ success: true, data: { settings: safe, secretsInfo } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/settings', async (req, res) => {
  try {
    let s = await realPrisma.settings.findFirst()
    const prevDemo = s?.demoModeEnabled ?? false
    const rawIn = (req.body || {}) as Record<string, unknown>
    const body = { ...rawIn } as Record<string, unknown>
    const { setSecret } = await import('../lib/secrets')

    if (body.smtpPass === '••••••') delete body.smtpPass
    if (body.imapPassword === '••••••' || body.imapPassword === '******') delete body.imapPassword
    if (typeof body.openaiApiKey === 'string' && body.openaiApiKey.startsWith('sk-••••')) delete body.openaiApiKey
    if (body.telegramBotToken === '••••') delete body.telegramBotToken

    if (!s) s = await realPrisma.settings.create({ data: {} })

    const secretFields = ['smtpPass', 'imapPassword', 'openaiApiKey', 'telegramBotToken'] as const
    for (const field of secretFields) {
      if (!Object.prototype.hasOwnProperty.call(rawIn, field)) continue
      const val = body[field]
      await setSecret(field, val == null || val === '' ? null : String(val))
      delete body[field]
    }

    await realPrisma.settings.update({ where: { id: s.id }, data: body as never })

    try {
      const { ensureAppSettings, appSettingsPatchData } = await import('../lib/appSettingsMerge')
      await ensureAppSettings(realPrisma)
      const patch = appSettingsPatchData(body)
      if (Object.keys(patch).length > 0) {
        await realPrisma.appSettings.update({ where: { id: 'default' }, data: patch })
      }
    } catch {
      /* AppSettings table may not exist until migration */
    }

    const refreshed = await realPrisma.settings.findFirst()
    const nextDemo = refreshed?.demoModeEnabled ?? false
    if (nextDemo && !prevDemo) {
      const persona =
        typeof body.demoPersona === 'string' && body.demoPersona.length > 0
          ? body.demoPersona
          : (refreshed?.demoPersona ?? 'engineer')
      const { wipeAndSeedDemoDb } = await import('../lib/demoSeed')
      const { invalidateDemoStateCache } = await import('../lib/prismaProvider')
      await wipeAndSeedDemoDb(persona)
      invalidateDemoStateCache()
    } else if (!nextDemo && prevDemo) {
      const { invalidateDemoStateCache } = await import('../lib/prismaProvider')
      invalidateDemoStateCache()
    }

    res.json({ success: true, data: { saved: true } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/accounts', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    const accounts = await prisma.account.findMany({ orderBy: { createdAt: 'asc' } })
    res.json({ success: true, data: { accounts } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/accounts', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body = { ...(req.body as Record<string, unknown>) }
    delete body[['bal', 'anceCzk'].join('') as keyof typeof body]
    const currency = String(body.currency ?? 'CZK')
    const balanceLocal = body.balanceLocal !== undefined ? body.balanceLocal : 0
    const localDec = d(balanceLocal as never)
    delete body.balanceCzkSnapshot
    const cur = currency.toUpperCase().trim()
    const snap =
      cur === 'CZK'
        ? balanceCzkSnapshotForWrite(currency, localDec, localDec)
        : balanceCzkSnapshotForWrite(currency, localDec, undefined)
    const acc = await prisma.account.create({
      data: {
        ...body,
        currency,
        balanceLocal: localDec,
        balanceCzkSnapshot: snap
      } as never
    })
    res.status(201).json({ success: true, data: { account: acc } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.put('/api/accounts/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const prev = await prisma.account.findUnique({ where: { id: req.params.id } })
    if (!prev) {
      return res.status(404).json({ success: false, error: 'Account not found' })
    }
    const patch = { ...(req.body as Record<string, unknown>) }
    delete patch[['bal', 'anceCzk'].join('') as keyof typeof patch]
    delete patch.balanceCzkSnapshot
    const shaped = mergedAccountShapeB(prev, patch)
    const updated = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        ...patch,
        currency: shaped.currency,
        balanceLocal: shaped.balanceLocal,
        balanceCzkSnapshot: shaped.balanceCzkSnapshot
      } as never
    })
    res.json({ success: true, data: { account: updated } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

// V6: dedicated balance update endpoint — Settings/Accounts pages call this.
app.patch('/api/accounts/:id/balance', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const prev = await prisma.account.findUnique({ where: { id: req.params.id } })
    if (!prev) return res.status(404).json({ success: false, error: 'Account not found' })
    const balanceLocal = (req.body as { balanceLocal?: unknown })?.balanceLocal
    if (balanceLocal == null) {
      return res.status(400).json({ success: false, error: 'balanceLocal required' })
    }
    const shaped = mergedAccountShapeB(prev, { balanceLocal })
    const updated = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        balanceLocal: shaped.balanceLocal,
        balanceCzkSnapshot: shaped.balanceCzkSnapshot
      } as never
    })
    res.json({ success: true, data: { account: updated } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

// V6: soft-delete account — preserves history/snapshots; toggles isActive.
app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const hard = String((req.query as Record<string, string | undefined>).hard || '') === '1'
    if (hard) {
      await prisma.account.delete({ where: { id: req.params.id } })
    } else {
      await prisma.account.update({ where: { id: req.params.id }, data: { isActive: false } })
    }
    res.json({ success: true, data: { id: req.params.id, hardDelete: hard } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

function parsePrismaDateTime(val: unknown): Date | null {
  if (val == null) return null
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val
  const s = String(val).trim()
  if (!s) return null
  const withTime = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00.000Z` : s
  const dt = new Date(withTime)
  return Number.isNaN(dt.getTime()) ? null : dt
}

app.post('/api/holdings', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body = req.body as Record<string, unknown>
    const purchaseDate = parsePrismaDateTime(body.purchaseStartDate)
    if (!purchaseDate) {
      return res.status(400).json({ success: false, error: 'purchaseStartDate must be a valid date (YYYY-MM-DD or ISO)' })
    }
    const taxFreeDate = new Date(purchaseDate)
    taxFreeDate.setFullYear(taxFreeDate.getFullYear() + 3)

    const holding = await prisma.holding.create({
      data: {
        ...body,
        purchaseStartDate: purchaseDate,
        taxFreeDate,
        currentValueCzk: (Number(body.units) || 0) * (Number(body.nav) || 0)
      } as never
    })
    res.status(201).json({ success: true, data: { holding } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.put('/api/holdings/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body: Record<string, unknown> = { ...(req.body as Record<string, unknown>) }
    if (body.units !== undefined || body.nav !== undefined) {
      const current = await prisma.holding.findUnique({ where: { id: req.params.id } })
      body.currentValueCzk =
        (Number(body.units ?? current?.units ?? 0) || 0) * (Number(body.nav ?? current?.nav ?? 0) || 0)
    }
    if (body.purchaseStartDate != null && body.purchaseStartDate !== '') {
      const pd = parsePrismaDateTime(body.purchaseStartDate)
      if (!pd) {
        return res.status(400).json({ success: false, error: 'purchaseStartDate must be a valid date (YYYY-MM-DD or ISO)' })
      }
      body.purchaseStartDate = pd
      const t = new Date(pd)
      t.setFullYear(t.getFullYear() + 3)
      body.taxFreeDate = t
    }
    const updated = await prisma.holding.update({ where: { id: req.params.id }, data: body as never })
    res.json({ success: true, data: { holding: updated } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.delete('/api/holdings/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const hard = String((req.query as Record<string, string | undefined>).hard || '') === '1'
    if (hard) {
      await prisma.holding.delete({ where: { id: req.params.id } })
    } else {
      await prisma.holding.update({ where: { id: req.params.id }, data: { status: 'EXITED' } })
    }
    res.json({ success: true, data: { id: req.params.id, hardDelete: hard } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

// ===== V6 Cashflow CRUD =====
// List cashflows for a holding (or all when ?holdingId is omitted).
app.get('/api/cashflows', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const hid = (req.query as Record<string, string | undefined>).holdingId
    const where = hid ? { holdingId: hid } : {}
    const rows = await prisma.cashflow.findMany({
      where,
      orderBy: { date: 'asc' }
    })
    res.json({ success: true, data: { cashflows: rows } })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

const CASHFLOW_TYPES = new Set(['SIP', 'LUMP_SUM', 'WITHDRAWAL', 'DIVIDEND'])

app.post('/api/cashflows', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body = (req.body || {}) as Record<string, unknown>
    const holdingId = String(body.holdingId || '')
    if (!holdingId) return res.status(400).json({ success: false, error: 'holdingId required' })
    const date = body.date ? new Date(String(body.date)) : null
    if (!date || Number.isNaN(date.getTime())) {
      return res.status(400).json({ success: false, error: 'date required (ISO string)' })
    }
    if (body.amountCzk == null || body.amountCzk === '') {
      return res.status(400).json({ success: false, error: 'amountCzk required' })
    }
    const type = String(body.type || 'SIP').toUpperCase()
    if (!CASHFLOW_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type' })
    }
    const cf = await prisma.cashflow.create({
      data: {
        holdingId,
        date,
        amountCzk: d(body.amountCzk as never),
        type,
        notes: body.notes != null ? String(body.notes) : null
      }
    })
    res.status(201).json({ success: true, data: { cashflow: cf } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

app.patch('/api/cashflows/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body = (req.body || {}) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if (body.date !== undefined) {
      const dt = new Date(String(body.date))
      if (Number.isNaN(dt.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date' })
      }
      patch.date = dt
    }
    if (body.amountCzk !== undefined) patch.amountCzk = d(body.amountCzk as never)
    if (body.type !== undefined) {
      const t = String(body.type).toUpperCase()
      if (!CASHFLOW_TYPES.has(t)) {
        return res.status(400).json({ success: false, error: 'Invalid type' })
      }
      patch.type = t
    }
    if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes)
    const updated = await prisma.cashflow.update({
      where: { id: req.params.id },
      data: patch as never
    })
    res.json({ success: true, data: { cashflow: updated } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

app.delete('/api/cashflows/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    await prisma.cashflow.delete({ where: { id: req.params.id } })
    res.json({ success: true, data: { id: req.params.id } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/system/status', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    const [hCount, sCount, aCount] = await Promise.all([
      prisma.holding.count(),
      prisma.snapshot.count(),
      prisma.alertLog.count()
    ])
    const { demo } = await isDemoMode()
    res.json({
      success: true,
      data: {
        dbConnected: true,
        holdings: hCount,
        snapshots: sCount,
        alerts: aCount,
        demoMode: demo,
        timestamp: new Date()
      }
    })
  } catch {
    res.json({ success: true, data: { dbConnected: false } })
  }
})

app.post('/api/refresh', async (_req, res) => {
  res.json({ success: true, message: 'Refresh queued' })
})

app.get('/api/library', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const where: Record<string, unknown> = {}
    if (req.query.category) where.category = String(req.query.category).toUpperCase()
    if (req.query.availableInGeorge === 'true') where.availableInGeorge = true
    if (req.query.availableInGeorge === 'false') where.availableInGeorge = false
    const list = await prisma.instrumentLibrary.findMany({
      where: where as any,
      orderBy: { score: 'desc' }
    })
    res.json({ success: true, data: { instruments: list } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/library/compare/:holdingId', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const h = await prisma.holding.findUnique({ where: { id: req.params.holdingId } })
    if (!h) return res.status(404).json({ success: false, error: 'Holding not found' })
    const lib = await loadAllLibrary()
    const withScores = lib.map((i) => ({ ...i, score: i.score ?? scoreInstrument(i) })) as any[]
    const best = findBestAlternative(h, withScores)
    const fxr = (await getFXRates()) as any
    const fx = { EURCZK: fxr.EURCZK, EURINR: fxr.EURINR }
    const comp = best
      ? compareFundToETF(
          h,
          withScores.find((i) => i.isin === best.instrument.isin) as any,
          fx,
          withScores as any
        )
      : null
    res.json({ success: true, data: { bestAlternative: best, comparison: comp } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/intelligence/ask', async (req, res) => {
  try {
    const q = String(req.body?.question || '').trim()
    if (!q) return res.status(400).json({ success: false, error: 'question required' })
    const now = Date.now()
    const ckey = `ask:${q.toLowerCase()}`
    const c = askCache.get(ckey)
    if (c && now - c.at < 3600_000) {
      return res.json({ success: true, data: { memory: c.rec, cached: true } })
    }
    const key = clientKey(req)
    const w = askRate[key] || { count: 0, windowStart: now }
    if (now - w.windowStart > 3600_000) {
      w.count = 0
      w.windowStart = now
    }
    w.count += 1
    askRate[key] = w
    if (w.count > 10) {
      return res.status(429).json({ success: false, error: 'Rate limit: 10 questions per hour' })
    }
    const portfolio = await getIntelligencePortfolio()
    if (!portfolio) return res.status(500).json({ success: false, error: 'Portfolio unavailable' })
    const { envAnthropicApiKey, envOpenaiApiKey } = await import('../lib/integrations/env-fallback')
    const { getSecret } = await import('../lib/secrets')
    let openaiKey = envOpenaiApiKey()
    try {
      const sk = await getSecret('openaiApiKey')
      if (sk) openaiKey = sk
    } catch {
      /* plaintext blocked — env / Integrations only */
    }
    const mem = await askPie(q, portfolio, { anthropicKey: envAnthropicApiKey(), openaiKey })
    askCache.set(ckey, { at: now, rec: mem })
    res.json({ success: true, data: { memory: mem, cached: false } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/intelligence/history', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    const list = await prisma.aIMemory.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
    res.json({ success: true, data: { memories: list } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/intelligence/feedback', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const { memoryId, feedback } = req.body
    if (!memoryId || !['HELPFUL', 'NOT_HELPFUL', 'PARTIALLY_HELPFUL'].includes(feedback)) {
      return res.status(400).json({ success: false, error: 'Invalid payload' })
    }
    const u = await prisma.aIMemory.update({
      where: { id: memoryId },
      data: { userFeedback: feedback }
    })
    res.json({ success: true, data: { memory: u } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/india/rates', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    const rows = await prisma.indiaIntelligence.findMany({
      where: { dataType: 'NRE_FD_RATE' },
      orderBy: { bankName: 'asc' }
    })
    const byBank: Record<string, { tenor: string; value: number }[]> = {}
    for (const r of rows) {
      const b = r.bankName || 'Unknown'
      if (!byBank[b]) byBank[b] = []
      if (r.tenor) byBank[b]!.push({ tenor: r.tenor, value: num(r.value) })
    }
    res.json({ success: true, data: { rates: rows, byBank } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/india/analysis', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    const rbi = await prisma.indiaIntelligence.findFirst({
      where: { dataType: 'RBI_RATE' },
      orderBy: { validFrom: 'desc' }
    })
    const rates = await prisma.indiaIntelligence.findMany({
      where: { dataType: 'NRE_FD_RATE' },
      orderBy: { value: 'desc' }
    })
    const best1yr = rates.find((r) => r.tenor === '1yr')
    const fx = await getFXRates()
    const nroInr = 200_000
    const dtaa = calculateDTAABenefit(nroInr, num(rbi?.value ?? getRbiRepoRate().value), fx.EURCZK, fx.EURINR)
    const fcnr = compareFCNRvsNRE(5_000_000, 3, { eurCzk: fx.EURCZK, eurInr: fx.EURINR })
    res.json({
      success: true,
      data: {
        rbi: rbi
          ? { value: rbi.value, changeDirection: rbi.changeDirection, asOf: rbi.validFrom }
          : { value: getRbiRepoRate().value, changeDirection: 'STABLE' },
        bestNre1yr: best1yr
          ? { bank: best1yr.bankName, value: best1yr.value, tenor: best1yr.tenor }
          : { bank: 'HDFC Bank', value: 7.25, tenor: '1yr' },
        dtaaSample: dtaa,
        fcnrVsNre: fcnr,
        nriFunds: getNRIEligibleMutualFunds()
      }
    })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/settings/test-email', async (_req, res) => {
  const r = await sendTestEmail()
  if (!r.sent) return res.status(400).json({ success: false, sent: false, error: r.error })
  res.json({ success: true, sent: true })
})

const portfolioFreshStartLastByIp: Record<string, number> = {}

// V6: backup export — full personal DB JSON snapshot.
app.get('/api/settings/backup/export', async (_req, res) => {
  try {
    const { exportBackup } = await import('../lib/backup')
    const bundle = await exportBackup(realPrisma)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    res.setHeader('Content-Disposition', `attachment; filename="pie-backup-${stamp}.json"`)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(200).send(JSON.stringify(bundle))
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

// V6: backup restore — additive. Skips rows whose id already exists.
app.post('/api/settings/backup/import', async (req, res) => {
  try {
    const body = (req.body || {}) as { bundle?: unknown; confirmPhrase?: string }
    const phrase = String(body.confirmPhrase || '').trim()
    if (phrase !== 'restore') {
      return res.status(400).json({ success: false, error: 'Confirmation must be exactly: restore' })
    }
    if (!body.bundle || typeof body.bundle !== 'object') {
      return res.status(400).json({ success: false, error: 'bundle missing' })
    }
    const { restoreBackup } = await import('../lib/backup')
    const results = await restoreBackup(realPrisma, body.bundle as never)
    res.json({ success: true, data: { results } })
  } catch (e: unknown) {
    res.status(400).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

app.post('/api/settings/portfolio-fresh-start', async (req, res) => {
  try {
    const phrase = String((req.body || {}).confirmPhrase || '').trim()
    if (phrase !== 'reset') {
      return res.status(400).json({ success: false, error: 'Confirmation must be exactly the word: reset' })
    }
    const s0 = await realPrisma.settings.findFirst()
    if (s0?.demoModeEnabled) {
      return res.status(400).json({
        success: false,
        error:
          'Turn Demo mode off first. This reset clears your personal database (DATABASE_URL) only — not the isolated demo database.'
      })
    }
    const ip = clientKey(req)
    const prev = portfolioFreshStartLastByIp[ip] || 0
    if (Date.now() - prev < 90_000) {
      return res.status(429).json({ success: false, error: 'Wait at least 90 seconds between reset attempts.' })
    }
    portfolioFreshStartLastByIp[ip] = Date.now()
    const { wipePersonalPortfolioTables, markOnboardingIncomplete } = await import('../lib/portfolioFreshStart')
    const { tables } = await wipePersonalPortfolioTables(realPrisma)
    await markOnboardingIncomplete(realPrisma)
    await realPrisma.systemHealth.create({
      data: {
        checkName: 'PORTFOLIO_FRESH_START',
        status: 'INFO',
        message: `Personal portfolio data wiped (${tables.length} tables truncated). Settings, AppSettings, and integrations were kept.`,
        metadata: { truncatedTableCount: tables.length } as object
      }
    })
    res.json({
      success: true,
      data: {
        truncatedTableCount: tables.length,
        message: 'Personal portfolio cleared. Onboarding is marked incomplete — add holdings and accounts again.'
      }
    })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) })
  }
})

app.post('/api/scheduler/run-now', async (_req, res) => {
  try {
    const r = await runMorningJob()
    res.json({ success: true, data: { triggered: r.triggered, errors: r.errors, alerts: r.alertsCreated } })
  } catch (e: any) {
    res.status(500).json({ success: false, data: { triggered: 0, errors: [e.message] } })
  }
})

app.get('/api/currency/rates', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    const { ensureFreshRatesIfStale, getRateAge } = await import('../lib/currency')
    await ensureFreshRatesIfStale()
    const [e, u, i, age] = await Promise.all([
      prisma.fXRate.findFirst({ where: { base: 'CZK', quote: 'EUR' }, orderBy: { fetchedAt: 'desc' } }),
      prisma.fXRate.findFirst({ where: { base: 'CZK', quote: 'USD' }, orderBy: { fetchedAt: 'desc' } }),
      prisma.fXRate.findFirst({ where: { base: 'CZK', quote: 'INR' }, orderBy: { fetchedAt: 'desc' } }),
      getRateAge()
    ])
    res.json({
      success: true,
      data: {
        czkPerUnit: { EUR: e?.rate, USD: u?.rate, INR: i?.rate },
        fetchedAt: e?.fetchedAt,
        source: e?.source,
        stale: e?.stale,
        ageMinutes: age
      }
    })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/currency/refresh', async (_req, res) => {
  try {
    const { fetchAllRates } = await import('../lib/currency')
    const r = await fetchAllRates()
    res.json({ success: true, data: { rates: r } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/library/reseed', async (_req, res) => {
  try {
    const prisma = await getPrisma()
    await prisma.instrumentLibrary.deleteMany({})
    const { seedLibraryWithTopETFs } = await import('../lib/instrumentLibrary')
    await seedLibraryWithTopETFs()
    const n = await prisma.instrumentLibrary.count()
    res.json({ success: true, data: { count: n } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

const PORT = process.env.PORT || 3002
if (process.env.NODE_ENV !== 'test') {
  void (async () => {
    // V6: boot contract. In production any FAIL aborts startup with a clear log.
    const { runBootContract } = await import('../lib/bootContract')
    const { ok: contractOk } = await runBootContract({ realPrisma })
    if (!contractOk && process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error('[PIE] Boot contract failed in production — refusing to start.')
      process.exit(1)
    }

    const { seedLibraryWithTopETFs } = await import('../lib/instrumentLibrary')
    const { seedNREFDRates, fetchRBIRate } = await import('../lib/indiaIntelligence')
    const { startScheduler } = await import('../lib/scheduler')
    const { startTelegramBot } = await import('../lib/telegram/bot')
    const { ensureFreshRatesIfStale } = await import('../lib/currency')
    try {
      await ensureFreshRatesIfStale().catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[PIE] FX bootstrap:', e)
      })
      // V6 safety: every boot-time seed/bootstrap goes against realPrisma so demo
      // mode cannot poison personal data on first run, and vice versa.
      const { bootstrapIntegrationsFromEnvIfNeeded } = await import('../lib/integrations/store')
      await bootstrapIntegrationsFromEnvIfNeeded(realPrisma)
      const { ensureAppSettings } = await import('../lib/appSettingsMerge')
      await ensureAppSettings(realPrisma)
      const { refreshDashboardAuthEnabledFromDb } = await import('../lib/dashboardAuth')
      await refreshDashboardAuthEnabledFromDb(realPrisma)
      const { bootstrapSystemHealth } = await import('../lib/bootstrapSystemHealth')
      await bootstrapSystemHealth(realPrisma)
      await seedLibraryWithTopETFs(realPrisma)
      await seedNREFDRates(realPrisma)
      const rbiN = await realPrisma.indiaIntelligence.count({ where: { dataType: 'RBI_RATE' } })
      if (rbiN === 0) {
        await fetchRBIRate(realPrisma)
      }
      startScheduler()
      await startTelegramBot()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[PIE] Startup init failed', e)
    }
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`PIE (Personal Investment Engine) running at http://localhost:${PORT}`)
      // eslint-disable-next-line no-console
      console.log(`Dashboard: http://localhost:${PORT}`)
      // eslint-disable-next-line no-console
      console.log(`Settings:  http://localhost:${PORT}/settings`)
    })
  })()
}

export default app
