/**
 * V6 backup/restore — JSON snapshot of the personal database.
 *
 * Exported tables (whitelist):
 *   AppSettings, Settings, Holding, Cashflow, Account, IndiaMutualFund,
 *   IndiaFixedDeposit, Snapshot, IntegrationProvider.
 *
 * Secrets in IntegrationProvider stay encrypted in the export (envelope is
 * ciphertext). Restoring on another machine requires the same key file
 * (PIE_SECRET_KEY_PATH); otherwise re-enter secrets in the UI after import.
 */
import type { PrismaClient } from '@prisma/client'

export type BackupBundle = {
  version: 'PIE_V6_BACKUP_1'
  createdAt: string
  source: 'personal'
  tables: Record<string, unknown[]>
}

const ALLOWED_TABLES = [
  'appSettings',
  'settings',
  'holding',
  'cashflow',
  'account',
  'indiaMutualFund',
  'indiaFixedDeposit',
  'snapshot',
  'integrationProvider'
] as const

type AllowedTable = (typeof ALLOWED_TABLES)[number]

export async function exportBackup(prisma: PrismaClient): Promise<BackupBundle> {
  const tables: Record<string, unknown[]> = {}
  for (const t of ALLOWED_TABLES) {
    const client = (prisma as unknown as Record<AllowedTable, { findMany: () => Promise<unknown[]> }>)[t]
    if (!client || typeof client.findMany !== 'function') continue
    try {
      tables[t] = await client.findMany()
    } catch {
      tables[t] = []
    }
  }
  return {
    version: 'PIE_V6_BACKUP_1',
    createdAt: new Date().toISOString(),
    source: 'personal',
    tables
  }
}

export type RestoreResult = {
  table: string
  inserted: number
  skipped: number
  error?: string
}

/**
 * Restore — additive only. Existing rows with the same primary key are kept;
 * new rows from the bundle are inserted. Settings/AppSettings are upserted
 * onto id='default'.
 */
export async function restoreBackup(
  prisma: PrismaClient,
  bundle: BackupBundle
): Promise<RestoreResult[]> {
  if (bundle.version !== 'PIE_V6_BACKUP_1') {
    throw new Error('Unsupported backup version: ' + String(bundle.version))
  }
  const out: RestoreResult[] = []
  for (const t of ALLOWED_TABLES) {
    const rows = (bundle.tables[t] || []) as Array<Record<string, unknown>>
    if (!Array.isArray(rows) || rows.length === 0) {
      out.push({ table: t, inserted: 0, skipped: 0 })
      continue
    }
    const client = (prisma as unknown as Record<AllowedTable, {
      create: (a: { data: Record<string, unknown> }) => Promise<unknown>
      findUnique: (a: { where: Record<string, unknown> }) => Promise<unknown>
      upsert?: (a: {
        where: Record<string, unknown>
        update: Record<string, unknown>
        create: Record<string, unknown>
      }) => Promise<unknown>
    }>)[t]
    let inserted = 0
    let skipped = 0
    let errored: string | undefined
    for (const row of rows) {
      try {
        if (t === 'appSettings' || t === 'settings' || t === 'integrationProvider') {
          const id = (row.id ?? (t === 'integrationProvider' ? row.key : 'default')) as string
          const where: Record<string, unknown> =
            t === 'integrationProvider' ? { key: row.key } : { id }
          if (typeof client.upsert === 'function') {
            await client.upsert({ where, update: row, create: row })
            inserted += 1
            continue
          }
        }
        const id = row.id as string | undefined
        if (id) {
          const exists = await client.findUnique({ where: { id } })
          if (exists) {
            skipped += 1
            continue
          }
        }
        await client.create({ data: row })
        inserted += 1
      } catch (e: unknown) {
        skipped += 1
        errored = e instanceof Error ? e.message : String(e)
      }
    }
    out.push({ table: t, inserted, skipped, error: errored })
  }
  return out
}
