import type { Express } from 'express'
import { getPrisma } from '../lib/prisma'
import { createStrategyProposal, proposeStrategiesForAllActiveHoldings } from '../lib/intelligence/createStrategyProposal'
import { evaluateAllApprovedStrategies, evaluateSellDecision } from '../lib/intelligence/sellDecisionEngine'

export function registerStrategyRoutes(app: Express): void {
  app.get('/api/strategies', async (_req, res) => {
    try {
      const prisma = await getPrisma()
      const strategies = await prisma.fundStrategy.findMany({
        where: { status: { not: 'SUPERSEDED' } },
        include: {
          holding: {
            select: {
              isin: true,
              name: true,
              category: true,
              currentValueCzk: true,
              status: true
            }
          },
          signals: { orderBy: { firedAt: 'desc' }, take: 3 }
        },
        orderBy: { proposedAt: 'desc' }
      })
      res.json({ success: true, data: strategies })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.get('/api/strategies/:holdingId', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const strategy = await prisma.fundStrategy.findFirst({
        where: {
          holdingId: req.params.holdingId,
          status: { not: 'SUPERSEDED' }
        },
        include: {
          holding: true,
          signals: { orderBy: { firedAt: 'desc' } }
        }
      })
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'No strategy found' })
      }
      res.json({ success: true, data: strategy })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.post('/api/strategies/propose-all', async (_req, res) => {
    try {
      const results = await proposeStrategiesForAllActiveHoldings()
      res.json({ success: true, data: results })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.post('/api/strategies/propose/:holdingId', async (req, res) => {
    try {
      const strategy = await createStrategyProposal(req.params.holdingId)
      res.json({ success: true, data: strategy })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.patch('/api/strategies/:strategyId/approve', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const note = (req.body as { note?: unknown } | null | undefined)?.note
      const strategy = await prisma.fundStrategy.update({
        where: { id: req.params.strategyId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvalNote: note == null ? null : String(note)
        }
      })
      res.json({ success: true, data: strategy })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.patch('/api/strategies/:strategyId/reject', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const strategy = await prisma.fundStrategy.update({
        where: { id: req.params.strategyId },
        data: { status: 'REJECTED', rejectedAt: new Date() }
      })
      res.json({ success: true, data: strategy })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.patch('/api/strategies/:strategyId', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const allowedFields = [
        'allocationPct',
        'absoluteCapCzk',
        'monthlySipCzk',
        'profitCapPct',
        'profitCapCzk',
        'drawdownGuardrailPct',
        'preferTaxFreeExit',
        'approvalNote'
      ]
      const body = (req.body || {}) as Record<string, unknown>
      const updates: Record<string, unknown> = {}
      for (const field of allowedFields) {
        if (body[field] !== undefined) updates[field] = body[field]
      }
      const strategy = await prisma.fundStrategy.update({
        where: { id: req.params.strategyId },
        data: updates as never
      })
      res.json({ success: true, data: strategy })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  // --- Area 2: Sell decision engine routes ---
  // Dry-run evaluation (no DB writes; requires APPROVED/MONITORING strategy).
  app.get('/api/strategies/:holdingId/evaluate', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const decision = await evaluateSellDecision(req.params.holdingId, prisma)
      res.json({ success: true, data: decision })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  // Evaluate all approved strategies and persist StrategySignal rows.
  app.post('/api/strategies/evaluate-all', async (_req, res) => {
    try {
      const prisma = await getPrisma()
      const results = await evaluateAllApprovedStrategies(prisma)
      res.json({ success: true, data: results })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  // Read signal history for a holding.
  app.get('/api/strategies/:holdingId/signals', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const signals = await prisma.strategySignal.findMany({
        where: { holdingId: req.params.holdingId },
        orderBy: { firedAt: 'desc' },
        take: 50
      })
      res.json({ success: true, data: signals })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  // Acknowledge a signal (records user action; no further automation here).
  app.patch('/api/strategies/signals/:signalId/acknowledge', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const body = (req.body || {}) as { action?: unknown; note?: unknown }
      const action = body.action == null ? 'SKIP' : String(body.action)
      const note = body.note == null ? null : String(body.note)
      const signal = await prisma.strategySignal.update({
        where: { id: req.params.signalId },
        data: {
          acknowledgedAt: new Date(),
          userAction: action,
          userNote: note
        }
      })
      res.json({ success: true, data: signal })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })
}

