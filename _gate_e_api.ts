/**
 * GATE E: POST MF, fetch overview via in-process getPortfolioSummary (no HTTP port conflict).
 */
import { prisma } from './src/lib/prisma'
import { getPortfolioSummary } from './src/lib/portfolio'

async function main() {
  await prisma.indiaMutualFund.deleteMany({ where: { amfiCode: '999999' } })

  const before = await getPortfolioSummary()
  const nw0 = before.success && before.data ? before.data.netWorth : null

  await prisma.indiaMutualFund.create({
    data: {
      schemeName: 'TEST FUND',
      amfiCode: '999999',
      category: 'EQUITY_LARGE',
      units: 1000,
      avgNavInr: 100,
      currentNavInr: 110,
      purchaseDate: new Date('2024-01-01'),
      amc: 'TEST',
      sipActive: false
    }
  })

  const after = await getPortfolioSummary()
  const nw1 = after.success && after.data ? after.data.netWorth : null

  await prisma.indiaMutualFund.deleteMany({ where: { amfiCode: '999999' } })

  const expectedInr = 1000 * 110
  console.log('--- baseline netWorth (no test MF) ---')
  console.log(JSON.stringify(nw0, null, 2))
  console.log('--- after insert (TEST FUND 999999) ---')
  console.log(JSON.stringify(nw1, null, 2))
  console.log('--- expected INR value ---', expectedInr)
  if (nw0 && nw1) {
    const d = nw1.totalCzk - nw0.totalCzk
    const mf = (nw1 as any).indiaMfCzk
    console.log('--- delta totalCzk ---', d)
    console.log('--- indiaMfCzk (API field name) ---', mf)
    const fx = nw1.fxRatesUsed
    const czkPerInr = fx.EURINR > 0 ? fx.EURCZK / fx.EURINR : 0
    console.log('--- implied czkPerInr ---', czkPerInr)
    console.log('--- expected indiaMfCzk ---', expectedInr * czkPerInr)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
