/**
 * Deletes cashflows created by Banking_Input.xlsx import (fixed `notes` string).
 * Use when lifetime contributed is inflated (re-import stacked rows, or bad seed).
 *
 *   node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/clear-banking-import-cashflows.ts
 *   node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/clear-banking-import-cashflows.ts --dry-run
 */
import { PrismaClient } from '@prisma/client'

const IMPORT_CF_NOTE = 'Imported from Banking_Input.xlsx'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required (use --env-file=.env).')
    process.exit(1)
  }
  const dry = process.argv.includes('--dry-run')
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  try {
    const n = await prisma.cashflow.count({ where: { notes: IMPORT_CF_NOTE } })
    console.log(`Cashflows with notes "${IMPORT_CF_NOTE}": ${n}`)
    if (dry) {
      console.log('Dry run — no rows deleted.')
      return
    }
    if (n === 0) {
      console.log('Nothing to delete.')
      return
    }
    const r = await prisma.cashflow.deleteMany({ where: { notes: IMPORT_CF_NOTE } })
    console.log(`Deleted ${r.count} row(s). Re-import Banking_Input.xlsx (or add cashflows manually) if you still need history.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
