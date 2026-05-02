import { demoPrisma } from './prismaProvider'
import { getDemoFinances, getDemoPortfolio } from './demoData'
import { seedLibraryWithTopETFs } from './instrumentLibrary'

const SKIP_TRUNCATE = new Set(['_prisma_migrations', 'InstrumentLibrary', 'Settings'])

/**
 * Wipes demo DB user data (keeps InstrumentLibrary + Settings rows), then seeds persona data.
 */
export async function wipeAndSeedDemoDb(persona: string): Promise<void> {
  const tabRows = await demoPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  const tables = tabRows.map((r) => r.tablename).filter((t) => !SKIP_TRUNCATE.has(t))
  if (tables.length > 0) {
    const list = tables.map((t) => `"${t}"`).join(', ')
    await demoPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
  }

  const finances = getDemoFinances()
  const portfolio = getDemoPortfolio(persona)

  await demoPrisma.userProfile.create({
    data: {
      id: 'default',
      fullName: finances.profile.fullName,
      dateOfBirth: finances.profile.dateOfBirth,
      homeCurrency: finances.profile.homeCurrency,
      taxResidency: finances.profile.taxResidency,
      riskProfile: finances.profile.riskProfile,
      monthlyNetIncomeCzk: finances.profile.monthlyNetIncomeCzk,
      salaryDayOfMonth: finances.profile.salaryDayOfMonth,
      sipDayOfMonth: finances.profile.sipDayOfMonth,
      emergencyFundTarget: finances.profile.emergencyFundTarget,
      retirementAge: finances.profile.retirementAge,
      retirementMonthlyExpense: finances.profile.retirementMonthlyExpense
    }
  })

  for (const row of finances.income) {
    await demoPrisma.incomeEvent.create({
      data: {
        date: row.date,
        source: row.source,
        amountLocal: row.amountLocal,
        currency: row.currency,
        amountCzk: row.amountCzk,
        recurring: row.recurring,
        notes: null
      }
    })
  }

  for (const e of finances.expenses) {
    await demoPrisma.expenseCommitment.create({
      data: {
        category: e.category,
        description: e.description,
        amountCzk: e.amountCzk,
        frequency: e.frequency,
        dueDayOfMonth: e.dueDayOfMonth,
        startDate: e.startDate,
        active: e.active
      }
    })
  }

  for (const ev of finances.events) {
    await demoPrisma.upcomingEvent.create({
      data: {
        eventDate: ev.eventDate,
        title: ev.title,
        category: ev.category,
        budgetCzk: ev.budgetCzk,
        reservedCzk: ev.reservedCzk,
        status: ev.status
      }
    })
  }

  await demoPrisma.account.create({
    data: {
      type: 'SAVINGS',
      name: 'CZ Savings (demo)',
      institution: 'Demo Bank',
      balanceLocal: portfolio.netWorth.czechSavingsCzk,
      currency: 'CZK',
      balanceCzkSnapshot: portfolio.netWorth.czechSavingsCzk,
      country: 'CZ',
      isActive: true
    }
  })

  await demoPrisma.account.create({
    data: {
      type: 'NRE',
      name: 'NRE (demo)',
      institution: portfolio.indiaAccounts.nre.bank,
      balanceLocal: portfolio.indiaAccounts.nre.balanceInr,
      currency: 'INR',
      balanceCzkSnapshot: null,
      country: 'IN',
      isActive: true
    }
  })

  for (const h of portfolio.holdings) {
    await demoPrisma.holding.create({
      data: {
        id: h.id,
        isin: h.isin,
        name: h.name,
        type: 'MUTUAL_FUND',
        category: h.category,
        units: h.units,
        nav: h.nav,
        currency: 'CZK',
        currentValueCzk: h.currentValueCzk,
        monthlySipCzk: h.monthlySipCzk ?? 0,
        status: h.status,
        purchaseStartDate: h.purchaseStartDate,
        taxFreeDate: h.taxFreeDate,
        country: 'CZ'
      }
    })
  }

  for (const s of portfolio.snapshots.slice(-13)) {
    await demoPrisma.snapshot.create({
      data: {
        date: s.date,
        netWorthCzk: s.netWorthCzk,
        netWorthEur: s.netWorthEur,
        investedCzk: s.investedCzk,
        gainCzk: s.gainCzk,
        gainPct: s.gainPct,
        equityPct: s.equityPct,
        bondsPct: s.bondsPct,
        cashPct: s.cashPct,
        healthScore: s.healthScore,
        confidenceScore: s.confidenceScore,
        xirrIsEstimate: true
      }
    })
  }

  await seedLibraryWithTopETFs(demoPrisma)
}
