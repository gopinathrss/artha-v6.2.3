import type { Application } from 'express'
import { importBankingInput } from '../lib/import/excelImport'
import { pieUpload } from './uploadMulter'

export function registerExcelImportRoutes(app: Application) {
  app.post('/api/import/excel', pieUpload.single('file'), async (req, res) => {
    try {
      if (!req.file?.path) {
        return res.status(400).json({ success: false, error: 'No file uploaded' })
      }
      const q = req.query as Record<string, string | undefined>
      const dryRun =
        q.dryRun === 'true' || req.body?.dryRun === 'true' || req.body?.dryRun === true
      const result = await importBankingInput(req.file.path, { dryRun })
      return res.json({ success: true, data: result })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Import failed'
      return res.status(500).json({ success: false, error: m })
    }
  })
}
