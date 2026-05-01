import express from 'express'
import fs from 'fs'
import path from 'path'
import { getPrisma, realPrisma } from '../lib/prisma'
import { getPortfolioSummary } from '../lib/portfolio'
import { loadAllLibrary, findBestAlternative, compareFundToETF, scoreInstrument } from '../lib/instrumentLibrary'
import { askArtha } from '../lib/aiIntelligence'
import { sendTestEmail } from '../lib/emailService'
import { runMorningJob } from '../lib/triggers'
import { getFXRates } from '../lib/fetchers'
import {
  calculateDTAABenefit,
  compareFCNRvsNRE,
  getNRIEligibleMutualFunds
} from '../lib/indiaIntelligence'
import { registerCfoRoutes } from './cfoRoutes'
import { num, serializeJsonBody } from '../lib/money'
import { getRbiRepoRate } from '../lib/indiaIntelligence'

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use((_req, res, next) => {
  const send = res.json.bind(res)
  res.json = (body: unknown) => send(serializeJsonBody(body))
  next()
})
// Avoid stale dashboard during dev: browsers cache /artha-ui.css & HTML aggressively
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
    const s = await realPrisma.settings.findFirst()
    return { demo: s?.demoModeEnabled ?? false, persona: s?.demoPersona ?? 'engineer' }
  } catch {
    return { demo: false, persona: 'engineer' }
  }
}

const askRate: Record<string, { count: number; windowStart: number }> = {}
const askCache = new Map<string, { at: number; rec: unknown }>()

function clientKey(req: express.Request) {
  const h = req.headers['x-forwarded-for']
  const from = Array.isArray(h) ? h[0] : h?.split(',')[0]?.trim()
  return from || req.socket.remoteAddress || 'local'
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
  '/tax-calendar',
  '/alerts',
  '/reports',
  '/settings',
  '/intelligence',
  '/library'
]
const PAGE_FILES: Record<string, string> = {
  '/': 'index.html',
  '/onboarding': 'onboarding.html',
  '/this-month': 'this-month.html',
  '/finances': 'finances.html',
  '/india': 'india.html',
  '/portfolio': 'portfolio.html',
  '/tax-calendar': 'tax-calendar.html',
  '/alerts': 'alerts.html',
  '/reports': 'reports.html',
  '/settings': 'settings.html',
  '/intelligence': 'intelligence.html',
  '/library': 'library.html'
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
    const alerts = await prisma.alertLog.findMany({
      where: includeDismissed ? {} : { status: { not: 'DISMISSED' } },
      orderBy: { firedAt: 'desc' },
      take: 50
    })
    res.json({ success: true, data: { alerts }, demo })
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

app.get('/api/settings', async (_req, res) => {
  try {
    let s = await realPrisma.settings.findFirst()
    if (!s) s = await realPrisma.settings.create({ data: {} })
    const safe = {
      ...s,
      smtpPass: '••••••',
      openaiApiKey: s.openaiApiKey ? 'sk-••••' : null,
      telegramBotToken: s.telegramBotToken ? '••••' : null
    }
    res.json({ success: true, data: { settings: safe } })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/settings', async (req, res) => {
  try {
    let s = await realPrisma.settings.findFirst()
    const prevDemo = s?.demoModeEnabled ?? false
    const body = { ...req.body }
    if (body.smtpPass === '••••••') delete body.smtpPass
    if (body.openaiApiKey?.startsWith('sk-••••')) delete body.openaiApiKey
    if (body.telegramBotToken === '••••') delete body.telegramBotToken

    if (s) {
      await realPrisma.settings.update({ where: { id: s.id }, data: body })
    } else {
      await realPrisma.settings.create({ data: body })
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
    const acc = await prisma.account.create({ data: req.body })
    res.status(201).json({ success: true, data: { account: acc } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.put('/api/accounts/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const updated = await prisma.account.update({ where: { id: req.params.id }, data: req.body })
    res.json({ success: true, data: { account: updated } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.post('/api/holdings', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body = req.body
    const purchaseDate = new Date(body.purchaseStartDate)
    const taxFreeDate = new Date(purchaseDate)
    taxFreeDate.setFullYear(taxFreeDate.getFullYear() + 3)

    const holding = await prisma.holding.create({
      data: {
        ...body,
        purchaseStartDate: purchaseDate,
        taxFreeDate,
        currentValueCzk: (body.units ?? 0) * (body.nav ?? 0)
      }
    })
    res.status(201).json({ success: true, data: { holding } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.put('/api/holdings/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    const body: any = { ...req.body }
    if (body.units !== undefined || body.nav !== undefined) {
      const current = await prisma.holding.findUnique({ where: { id: req.params.id } })
      body.currentValueCzk = (body.units ?? current?.units ?? 0) * (body.nav ?? current?.nav ?? 0)
    }
    if (body.purchaseStartDate) {
      const d = new Date(body.purchaseStartDate)
      const t = new Date(d)
      t.setFullYear(t.getFullYear() + 3)
      body.taxFreeDate = t
    }
    const updated = await prisma.holding.update({ where: { id: req.params.id }, data: body })
    res.json({ success: true, data: { holding: updated } })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
  }
})

app.delete('/api/holdings/:id', async (req, res) => {
  try {
    const prisma = await getPrisma()
    await prisma.holding.update({ where: { id: req.params.id }, data: { status: 'EXITED' } })
    res.json({ success: true })
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
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
    const settings = await realPrisma.settings.findFirst()
    const anthropicKey = process.env.ANTHROPIC_API_KEY || ''
    const openaiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY || ''
    const mem = await askArtha(q, portfolio, { anthropicKey, openaiKey })
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
    const { seedLibraryWithTopETFs } = await import('../lib/instrumentLibrary')
    const { seedNREFDRates } = await import('../lib/indiaIntelligence')
    const { startScheduler } = await import('../lib/scheduler')
    const { startTelegramBot } = await import('../lib/telegram/bot')
    const { ensureFreshRatesIfStale } = await import('../lib/currency')
    try {
      await ensureFreshRatesIfStale().catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[ARTHA] FX bootstrap:', e)
      })
      await seedLibraryWithTopETFs()
      await seedNREFDRates()
      const rbiN = await realPrisma.indiaIntelligence.count({ where: { dataType: 'RBI_RATE' } })
      if (rbiN === 0) {
        const { fetchRBIRate } = await import('../lib/indiaIntelligence')
        await fetchRBIRate()
      }
      startScheduler()
      await startTelegramBot()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ARTHA] Startup init failed', e)
    }
  })()
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ARTHA running at http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`Dashboard: http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`Settings:  http://localhost:${PORT}/settings`)
  })
}

export default app
