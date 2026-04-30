/**
 * F3.3 smoke: empty India MF table → baseline overview → insert test MF → verify DB NAV + overview.
 * Run: node ./node_modules/tsx/dist/cli.mjs scripts/smoke-f3.3-overview.ts
 */
import { prisma } from '../src/lib/prisma'
import { getPortfolioSummary } from '../src/lib/portfolio'

async function main() {
  await prisma.indiaMutualFund.deleteMany({})

  const b = await getPortfolioSummary()
  const nw0 = b.success && b.data ? b.data.netWorth : null
  console.log('--- BASELINE (after DELETE all IndiaMutualFund) ---')
  console.log(JSON.stringify({ totalCzk: nw0?.totalCzk, indiaMfCzk: nw0?.indiaMfCzk, indiaCzk: nw0?.indiaCzk, indiaTotal: nw0?.indiaTotal }, null, 2))

  await prisma.indiaMutualFund.create({
    data: {
      schemeName: 'TEST F3.3',
      amfiCode: '999999',
      category: 'EQUITY_LARGE',
      units: 1000,
      avgNavInr: 100,
      currentNavInr: 110,
      purchaseDate: new Date('2024-01-01')
    }
  })

  const row = await prisma.indiaMutualFund.findFirst({ where: { amfiCode: '999999' } })
  console.log('--- DB ROW (expect currentNavInr=110, avgNavInr=100) ---')
  console.log(
    JSON.stringify(
      {
        currentNavInr: row?.currentNavInr?.toString(),
        avgNavInr: row?.avgNavInr?.toString(),
        units: row?.units?.toString()
      },
      null,
      2
    )
  )

  const a = await getPortfolioSummary()
  const nw1 = a.success && a.data ? a.data.netWorth : null
  console.log('--- AFTER INSERT ---')
  console.log(JSON.stringify({ totalCzk: nw1?.totalCzk, indiaMfCzk: nw1?.indiaMfCzk, indiaCzk: nw1?.indiaCzk, indiaTotal: nw1?.indiaTotal }, null, 2))

  await prisma.indiaMutualFund.deleteMany({ where: { amfiCode: '999999' } })
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
