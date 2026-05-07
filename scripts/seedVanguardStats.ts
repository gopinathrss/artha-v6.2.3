/**
 * One-time / idempotent seed for HistoricalNavStats from public fund factsheet figures (Area 2).
 * Run: npm run seed:vanguard-stats
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function upsertStats(
  isin: string,
  row: {
    cagr5y: number
    maxDrawdownAll: number
    sharpe3y: number
    recoveryMonths: number
    dataPointCount: number
  }
): Promise<void> {
  const now = new Date()
  await prisma.historicalNavStats.upsert({
    where: { isin },
    create: {
      isin,
      asOfDate: now,
      cagr5y: row.cagr5y,
      maxDrawdownAll: row.maxDrawdownAll,
      sharpe3y: row.sharpe3y,
      recoveryMonths: row.recoveryMonths,
      dataPointCount: row.dataPointCount,
      computedAt: now
    },
    update: {
      asOfDate: now,
      cagr5y: row.cagr5y,
      maxDrawdownAll: row.maxDrawdownAll,
      sharpe3y: row.sharpe3y,
      recoveryMonths: row.recoveryMonths,
      dataPointCount: row.dataPointCount,
      computedAt: now
    }
  })
}

async function main(): Promise<void> {
  await upsertStats('IE00B3XXRP09', {
    cagr5y: 11.9,
    maxDrawdownAll: 23.5,
    sharpe3y: 1.5,
    recoveryMonths: 7,
    dataPointCount: 60
  })
  console.log('Upserted Vanguard S&P 500 UCITS (IE00B3XXRP09).')

  const hy = await prisma.historicalNavStats.findUnique({ where: { isin: 'IE00B3F81409' } })
  if (!hy) {
    await upsertStats('IE00B3F81409', {
      cagr5y: 1.8,
      maxDrawdownAll: 12.0,
      sharpe3y: 0.35,
      recoveryMonths: 18,
      dataPointCount: 60
    })
    console.log('Seeded iShares EUR High Yield Corp Bond (IE00B3F81409).')
  } else {
    console.log('IE00B3F81409 already has HistoricalNavStats — skip create.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
