/**
 * One-time: wire Czech holdings to Erste NAV source when ISIN matches PIE fixture list.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/backfill-erste-source.ts
 */
import { prisma } from '../src/lib/prisma'
import { ERSTE_FUNDS } from '../tests/fixtures/erste-funds'

async function main() {
  let total = 0
  for (const f of ERSTE_FUNDS) {
    const r = await prisma.holding.updateMany({
      where: {
        isin: f.isin,
        OR: [{ navSourceType: null }, { navSourceType: 'MANUAL' }]
      },
      data: {
        navSourceType: 'ERSTE',
        navSourceId: f.notationId
      }
    })
    console.log(`${f.isin} ${f.name}: rowsAffected=${r.count}`)
    total += r.count
  }
  console.log(`\nTotal rows updated: ${total}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
