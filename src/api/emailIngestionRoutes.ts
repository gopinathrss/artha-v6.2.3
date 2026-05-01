import type { Application } from 'express'
import { Decimal } from '@prisma/client/runtime/library'
import { realPrisma } from '../lib/prisma'
import { runEmailIngestion } from '../lib/ingestion/orchestrator'
import { testImapConnection } from '../lib/ingestion/imap'
import { processCasPdf } from '../lib/ingestion/cas'
import { arthaUpload } from './uploadMulter'

export function registerEmailIngestionRoutes(app: Application) {
  app.post('/api/ingestion/run', async (_req, res) => {
    try {
      const result = await runEmailIngestion()
      return res.json({ success: true, data: result })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Ingestion failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.get('/api/ingestion/previews', async (req, res) => {
    try {
      const status = (req.query.status as string) || 'PENDING'
      const previews = await realPrisma.emailIngestionPreview.findMany({
        where: { status },
        orderBy: { receivedAt: 'desc' },
        take: 50
      })
      return res.json({ success: true, data: previews })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'List failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.get('/api/ingestion/previews/count', async (_req, res) => {
    try {
      const pending = await realPrisma.emailIngestionPreview.count({ where: { status: 'PENDING' } })
      return res.json({ success: true, data: { pending } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Count failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/ingestion/previews/:id/approve', async (req, res) => {
    try {
      const preview = await realPrisma.emailIngestionPreview.findUnique({
        where: { id: req.params.id }
      })
      if (!preview) return res.status(404).json({ success: false, error: 'Preview not found' })
      if (!preview.parsedFundIsin || preview.parsedAmount == null) {
        return res.status(400).json({ success: false, error: 'Preview missing required fields' })
      }
      const holding = await realPrisma.holding.findFirst({
        where: { isin: preview.parsedFundIsin }
      })
      if (!holding) {
        return res.status(400).json({ success: false, error: 'No matching holding' })
      }
      const when = preview.parsedDate ?? preview.receivedAt
      const exec = await realPrisma.sipExecution.create({
        data: {
          planId: null,
          planRowKey: null,
          scheduledDate: when,
          executedDate: when,
          isin: holding.isin,
          fundName: holding.name,
          side: 'BUY',
          amountCzk: preview.parsedAmount,
          currency: 'CZK',
          status: 'EXECUTED',
          notes: `Approved from preview ${preview.id}`,
          confirmationMethod: 'EMAIL_APPROVED',
          navAtExecution: null,
          unitsAcquired: null,
          amountLocal: null
        }
      })
      await realPrisma.emailIngestionPreview.update({
        where: { id: preview.id },
        data: {
          status: 'APPROVED',
          linkedExecutionId: exec.id,
          reviewedAt: new Date()
        }
      })
      return res.json({ success: true, data: exec })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Approve failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/ingestion/previews/:id/reject', async (req, res) => {
    try {
      const note = (req.body as { note?: string })?.note ?? null
      await realPrisma.emailIngestionPreview.update({
        where: { id: req.params.id },
        data: {
          status: 'REJECTED',
          reviewerNote: note,
          reviewedAt: new Date()
        }
      })
      return res.json({ success: true })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Reject failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/ingestion/test-connection', async (req, res) => {
    try {
      const b = (req.body || {}) as {
        imapHost?: string
        imapPort?: number
        imapUser?: string
        imapPassword?: string
      }
      const s = await realPrisma.settings.findFirst()
      const host = b.imapHost || s?.imapHost
      const port = b.imapPort ?? s?.imapPort ?? 993
      const user = b.imapUser || s?.imapUser
      let pass = b.imapPassword || s?.imapPassword
      if (pass === '••••••' || pass === '******') pass = s?.imapPassword ?? ''
      if (!host || !user || !pass) {
        return res.status(400).json({ success: false, error: 'IMAP host, user, and password required' })
      }
      const r = await testImapConnection({ host, port, user, password: pass })
      if (!r.ok) return res.status(400).json({ success: false, error: r.error || 'Connection failed' })
      return res.json({ success: true, data: { ok: true } })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Test failed'
      return res.status(500).json({ success: false, error: m })
    }
  })

  app.post('/api/ingestion/cas', arthaUpload.single('file'), async (req, res) => {
    try {
      if (!req.file?.path) {
        return res.status(400).json({ success: false, error: 'No file' })
      }
      const result = await processCasPdf(req.file.path)
      const preview = await realPrisma.emailIngestionPreview.create({
        data: {
          fromAddress: 'manual-upload',
          subject: req.file.originalname || 'CAS.pdf',
          parsedType: 'CAS_PDF',
          rawBody: result.extractedTextPreview.slice(0, 5000),
          confidence: new Decimal(30),
          status: 'PENDING'
        }
      })
      return res.json({ success: true, data: preview })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'CAS upload failed'
      return res.status(500).json({ success: false, error: m })
    }
  })
}
