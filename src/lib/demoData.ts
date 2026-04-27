function j(v: number, p = 0.015) {
  return Math.round(v * (1 + (Math.random() - 0.5) * p))
}

const PERSONAS = {
  engineer: { nw: 4_240_000, monthly: 32_000, xirr: 11.4, health: 78 },
  executive: { nw: 18_450_000, monthly: 85_000, xirr: 14.8, health: 91 },
  fire: { nw: 7_800_000, monthly: 55_000, xirr: 13.1, health: 94 },
  family: { nw: 3_100_000, monthly: 28_000, xirr: 9.8, health: 71 },
  starter: { nw: 680_000, monthly: 12_000, xirr: 8.2, health: 52 }
} as const

export function getDemoPortfolio(persona = 'engineer') {
  const base =
    PERSONAS[persona as keyof typeof PERSONAS] ?? PERSONAS.engineer

  const holdings = [
    {
      id: 'd1',
      name: 'iShares Core MSCI World',
      isin: 'IE00B4L5Y983',
      category: 'EQUITY',
      units: 156.42,
      nav: 116.39,
      currentValueCzk: j(445_230),
      monthlySipCzk: 12000,
      status: 'ACTIVE',
      purchaseStartDate: new Date('2021-03-15'),
      taxFreeDate: new Date('2024-03-15'),
      gainCzk: j(87_400),
      gainPct: 24.4,
      terPct: 0.2
    },
    {
      id: 'd2',
      name: 'iShares Emerging Markets',
      isin: 'IE00BKM4GZ66',
      category: 'EQUITY',
      units: 89.5,
      nav: 28.44,
      currentValueCzk: j(62_400),
      monthlySipCzk: 4000,
      status: 'ACTIVE',
      purchaseStartDate: new Date('2022-06-01'),
      taxFreeDate: new Date('2025-06-01'),
      gainCzk: j(12_100),
      gainPct: 24.1,
      terPct: 0.18
    },
    {
      id: 'd3',
      name: 'Sporobond',
      isin: 'CZ0008476009',
      category: 'BONDS',
      units: 2529,
      nav: 2.47,
      currentValueCzk: j(624_600),
      monthlySipCzk: 5000,
      status: 'ACTIVE',
      purchaseStartDate: new Date('2023-02-10'),
      taxFreeDate: new Date('2026-02-10'),
      gainCzk: j(18_400),
      gainPct: 3.0,
      terPct: 1.82
    },
    {
      id: 'd4',
      name: 'Sporoinvest',
      isin: 'CZ0008472264',
      category: 'CASH',
      units: 3314,
      nav: 2.21,
      currentValueCzk: j(732_400),
      monthlySipCzk: 2000,
      status: 'ACTIVE',
      purchaseStartDate: new Date('2022-11-15'),
      taxFreeDate: new Date('2025-11-15'),
      gainCzk: j(28_900),
      gainPct: 4.1,
      terPct: 0.95
    },
    {
      id: 'd5',
      name: 'Dynamic Mix',
      isin: 'CZ0008476041',
      category: 'EQUITY',
      units: 1723,
      nav: 2.02,
      currentValueCzk: j(34_800),
      monthlySipCzk: 0,
      status: 'INACTIVE',
      purchaseStartDate: new Date('2021-09-20'),
      taxFreeDate: new Date('2024-09-20'),
      gainCzk: j(4_200),
      gainPct: 13.7,
      terPct: 1.95
    },
    {
      id: 'd6',
      name: 'Corporate Bonds CS',
      isin: 'CZ0008476058',
      category: 'BONDS',
      units: 2543,
      nav: 1.64,
      currentValueCzk: j(41_700),
      monthlySipCzk: 3000,
      status: 'ACTIVE',
      purchaseStartDate: new Date('2023-08-01'),
      taxFreeDate: new Date('2026-08-01'),
      gainCzk: j(3_100),
      gainPct: 8.0,
      terPct: 1.45
    }
  ]

  const snapshots = generateSnapshots(base.nw, 36)

  return {
    netWorth: {
      totalCzk: j(base.nw),
      totalEur: j(base.nw / 24.5),
      czechTotal: j(2_150_000),
      indiaTotal: j(1_680_000),
      gainCzk: j(1_190_000),
      gainPct: 39.0,
      czechFundsCzk: j(1_941_000),
      czechSavingsCzk: 380_000,
      czechPensionCzk: 30_000,
      indiaNRECzk: j(441_500),
      indiaNROCzk: j(88_300),
      indiaFDCzk: j(110_400),
      fxRatesUsed: { EURCZK: 24.5, EURINR: 89.5 }
    },
    allocation: {
      equityPct: 48.2,
      bondsPct: 28.6,
      cashPct: 23.2,
      equityGap: -16.8,
      bondsGap: 3.6,
      cashGap: 13.2,
      equityCzk: j(1_040_000),
      bondsCzk: j(617_000),
      cashCzk: j(500_000)
    },
    xirr: {
      value: base.xirr + (Math.random() - 0.5),
      isEstimate: false,
      note: '',
      cashflowCount: 36
    },
    health: {
      score: base.health,
      grade: base.health >= 80 ? 'A' : base.health >= 65 ? 'B' : 'C',
      confidence: 88
    },
    confidence: 88,
    totalInvested: j(3_050_000),
    momChange: { czk: j(68_400), pct: 1.64 },
    holdings,
    snapshots,
    fxRates: { EURCZK: 24.5, EURINR: 89.5 },
    indiaAccounts: {
      nre: {
        bank: 'HDFC Bank',
        balanceInr: 2_000_000,
        balanceCzk: j(441_500),
        ratePct: 3.5
      },
      nro: {
        bank: 'HDFC Bank',
        balanceInr: 400_000,
        balanceCzk: j(88_300),
        ratePct: 3.5
      },
      fds: [
        {
          bank: 'HDFC Bank',
          amountInr: 500_000,
          ratePct: 7.25,
          maturityDate: new Date(Date.now() + 51 * 86400000),
          daysLeft: 51,
          maturityValueInr: 533_438
        },
        {
          bank: 'SBI',
          amountInr: 500_000,
          ratePct: 7.0,
          maturityDate: new Date(Date.now() + 625 * 86400000),
          daysLeft: 625,
          maturityValueInr: 575_000
        }
      ]
    },
    alerts: [
      {
        id: 'da1',
        triggerType: 'TAX_FREE_APPROACHING',
        urgency: 'HIGH',
        title: 'Sporobond tax-free in 27 days',
        message:
          'Sporobond (624,600 Kč) exits the Czech 3-year tax window on 10 Feb 2026. Gain: 18,400 Kč will be 100% yours. Plan your exit.',
        firedAt: new Date(Date.now() - 2 * 3600000)
      },
      {
        id: 'da2',
        triggerType: 'NRE_FD_MATURITY',
        urgency: 'MEDIUM',
        title: 'HDFC NRE FD matures in 51 days',
        message:
          '₹5,00,000 FD matures 15 Jun 2026. Best renewal rate: HDFC 7.25%. Renew for another 12 months.',
        firedAt: new Date(Date.now() - 86400000)
      },
      {
        id: 'da3',
        triggerType: 'ALLOCATION_DRIFT',
        urgency: 'MEDIUM',
        title: 'Equity below target by 16.8%',
        message:
          'Equity is 48.2% vs target 65%. Redirect next 3 months SIP to MSCI World ETF.',
        firedAt: new Date(Date.now() - 3 * 86400000)
      },
      {
        id: 'da4',
        triggerType: 'FEE_LEAK',
        urgency: 'MEDIUM',
        title: 'Annual fees: 9,420 Kč/year',
        message:
          'Sporobond (1.82%) and Corporate Bonds (1.45%) cost 9,420 Kč/year. Equivalent ETFs: 1,620 Kč/year. Saving: 7,800 Kč/year.',
        firedAt: new Date(Date.now() - 7 * 86400000)
      },
      {
        id: 'da5',
        triggerType: 'NET_WORTH_MILESTONE',
        urgency: 'INFO',
        title: 'Milestone: 4,000,000 Kč reached',
        message: 'Total wealth crossed 4,000,000 Kč. Next milestone: 4,500,000 Kč.',
        firedAt: new Date(Date.now() - 14 * 86400000)
      }
    ],
    taxCalendar: [
      {
        name: 'iShares MSCI World',
        taxFreeDate: new Date('2024-03-15'),
        daysLeft: -400,
        status: 'TAX FREE',
        gainCzk: 87400,
        valueCzk: 445230
      },
      {
        name: 'Sporoinvest',
        taxFreeDate: new Date('2025-11-15'),
        daysLeft: -160,
        status: 'TAX FREE',
        gainCzk: 28900,
        valueCzk: 732400
      },
      {
        name: 'Dynamic Mix',
        taxFreeDate: new Date('2024-09-20'),
        daysLeft: -220,
        status: 'TAX FREE',
        gainCzk: 4200,
        valueCzk: 34800
      },
      {
        name: 'Sporobond',
        taxFreeDate: new Date('2026-02-10'),
        daysLeft: 27,
        status: 'CRITICAL',
        gainCzk: 18400,
        valueCzk: 624600
      },
      {
        name: 'Corporate Bonds',
        taxFreeDate: new Date('2026-08-01'),
        daysLeft: 98,
        status: 'FUTURE',
        gainCzk: 3100,
        valueCzk: 41700
      }
    ],
    goals: {
      financialFreedom: {
        targetCzk: 5_000_000,
        currentCzk: base.nw,
        pct: ((base.nw / 5_000_000) * 100).toFixed(1)
      },
      retirement: { targetAge: 50, currentAge: 31, yearsLeft: 19, onTrack: true },
      property: { targetCzk: 4_000_000, savedCzk: 380_000, pct: 9.5 }
    },
    intelligence: {
      oneThingRecommendation:
        'Sporobond becomes tax-free in 27 days (10 Feb 2026). Your gain of 18,400 Kč will be completely tax-free. Exit on or after 10 Feb and redirect proceeds to iShares Core MSCI World (IE00B4L5Y983) — already available in your George account. This avoids 2,760 Kč in capital gains tax.',
      confidenceScore: 88,
      monthYear: new Date()
        .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        .toUpperCase()
    },
    demo: true,
    persona
  }
}

export function getDemoFinances() {
  return {
    profile: {
      id: 'default',
      fullName: 'Gopinath (demo)',
      dateOfBirth: new Date('1994-05-31'),
      homeCurrency: 'CZK',
      taxResidency: 'CZ',
      riskProfile: 'MODERATE',
      monthlyNetIncomeCzk: 65_000,
      salaryDayOfMonth: 15,
      emergencyFundTarget: 180_000,
      retirementAge: 50,
      retirementMonthlyExpense: 32_000
    },
    income: [
      {
        id: 'di1',
        source: 'SALARY',
        amountLocal: 65_000,
        currency: 'CZK',
        amountCzk: 65_000,
        recurring: true,
        date: new Date()
      }
    ],
    expenses: [
      { id: 'de1', category: 'RENT', description: 'Brno rent', amountCzk: 18_000, frequency: 'MONTHLY', dueDayOfMonth: 1, startDate: new Date('2023-01-01'), active: true },
      { id: 'de2', category: 'INSURANCE', description: 'Health / travel', amountCzk: 3_200, frequency: 'MONTHLY', dueDayOfMonth: 10, startDate: new Date('2023-01-01'), active: true }
    ],
    events: [
      {
        id: 'ev1',
        eventDate: new Date(Date.now() + 20 * 86400000),
        title: 'Prague trip',
        category: 'TRAVEL',
        budgetCzk: 30_000,
        reservedCzk: 20_000,
        status: 'UPCOMING'
      }
    ],
    plan: {
      monthYear: new Date().toISOString().slice(0, 7),
      totalAvailableCzk: 65_000,
      fixedExpensesCzk: 21_200,
      reservedEventsCzk: 10_000,
      investableCzk: 33_800,
      status: 'PROPOSED',
      planSource: 'DEMO',
      allocations: [
        {
          rowKey: 'r1',
          destination: 'iShares Core MSCI World',
          isin: 'IE00B4L5Y983',
          amountCzk: 12_000,
          reason: 'Equity toward target',
          currency: 'CZK',
          executionStatus: 'PENDING'
        },
        {
          rowKey: 'r2',
          destination: 'Sporobond',
          isin: 'CZ0008476009',
          amountCzk: 4_000,
          reason: 'Bond sleeve',
          currency: 'CZK',
          executionStatus: 'PENDING'
        },
        {
          rowKey: 'r3',
          destination: 'Prague trip reserve',
          amountCzk: 10_000,
          reason: 'Event reserve',
          currency: 'CZK',
          executionStatus: 'PENDING'
        }
      ]
    }
  }
}

function generateSnapshots(finalValue: number, months: number) {
  const snapshots: any[] = []
  let value = finalValue * 0.45
  const monthlyGrowth = Math.pow(finalValue / value, 1 / months) - 1
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)

  for (let i = 0; i < months; i++) {
    let ret = monthlyGrowth + (Math.random() - 0.5) * 0.04
    if (i >= 8 && i <= 10) ret = -0.04 + Math.random() * 0.02
    if (i >= 11 && i <= 13) ret = 0.04 + Math.random() * 0.02
    if (i === 20) ret = -0.025

    value = value * (1 + ret) + 25500
    value = Math.max(value, 50000)

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + i)

    const investedCzk = Math.round(25500 * (i + 1) * 0.45 + finalValue * 0.45)
    const gainCzk = Math.round(value) - investedCzk
    const gainPct = investedCzk === 0 ? 0 : (gainCzk / investedCzk) * 100

    snapshots.push({
      date,
      netWorthCzk: Math.round(value),
      netWorthEur: Math.round(value / 24.5),
      investedCzk,
      gainCzk,
      gainPct,
      equityPct: 48,
      bondsPct: 28,
      cashPct: 24,
      healthScore: 75,
      confidenceScore: 85
    })
  }
  return snapshots
}
