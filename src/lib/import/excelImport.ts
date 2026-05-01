import * as XLSX from 'xlsx'
import { Decimal } from '@prisma/client/runtime/library'
import { realPrisma as prisma } from '../prismaProvider'

export interface ImportResult {
  profileUpdated: boolean
  fundsImported: number
  cashflowsImported: number
  warnings: string[]
  errors: string[]
}

const FUND_INVESTED_RE = /Fund Invested \((\d{2})\/(\d{2})\/(\d{4})\)/i

function parseTargetMap(targetRows: Record<string, unknown>[]): Map<string, unknown> {
  const m = new Map<string, unknown>()
  if (!targetRows.length) return m
  const first = targetRows[0]
  if ('Key' in first && 'Value' in first) {
    for (const r of targetRows) {
      const k = r['Key']
      if (k != null && String(k).trim()) m.set(String(k).trim(), r['Value'])
    }
    return m
  }
  for (const r of targetRows) {
    for (const [k, v] of Object.entries(r)) {
      if (k != null && String(k).trim()) m.set(String(k).trim(), v)
    }
  }
  return m
}

function fundNameFromRow(f: Record<string, unknown>): string {
  const n = f['Fund Name'] ?? f['Name'] ?? f['Fund name']
  return n != null ? String(n) : ''
}

function monthlySipFromRow(f: Record<string, unknown>): number {
  const v =
    f['Monthly SIP Planned (CZK)'] ?? f['Monthly SIP (CZK)'] ?? f['SIP'] ?? f['Monthly SIP Planned']
  return Number(v ?? 0)
}

function findEarliestCashflowDate(rows: Record<string, unknown>[], notationId: string): Date | null {
  const row = rows.find((r) => String(r['Fund ID'] ?? '') === notationId)
  if (!row) return null
  let best: Date | null = null
  for (const [colName, rawValue] of Object.entries(row)) {
    const match = colName.match(FUND_INVESTED_RE)
    if (!match) continue
    const n = Number(rawValue)
    if (!Number.isFinite(n) || n === 0) continue
    const [, day, month, year] = match
    const d = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
    if (Number.isNaN(d.getTime())) continue
    if (!best || d.getTime() < best.getTime()) best = d
  }
  return best
}

export async function importBankingInput(
  filePath: string,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const wb = XLSX.readFile(filePath)
  const result: ImportResult = {
    profileUpdated: false,
    fundsImported: 0,
    cashflowsImported: 0,
    warnings: [],
    errors: []
  }

  const targetSheet = wb.Sheets['Target Set']
  if (!targetSheet) {
    result.errors.push('Sheet "Target Set" not found')
    return result
  }
  const targetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(targetSheet)
  const targetMap = parseTargetMap(targetRows)

  const equityTarget = Number(targetMap.get('equity_target') ?? 60)
  const bondsTarget = Number(targetMap.get('bonds_target') ?? 30)
  const cashTarget = Number(targetMap.get('cash_target') ?? 10)
  const monthlySipTarget = Number(targetMap.get('Monthly SIP (CZK)') ?? 15000)

  if (Math.abs(equityTarget + bondsTarget + cashTarget - 100) > 0.5) {
    result.warnings.push(
      `Target percentages sum to ${equityTarget + bondsTarget + cashTarget}, not 100`
    )
  }

  const fundSheet = wb.Sheets['FUND Plan']
  if (!fundSheet) {
    result.errors.push('Sheet "FUND Plan" not found')
    return result
  }
  const fundRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(fundSheet)

  const cashSheet = wb.Sheets['cash Flow sheet'] ?? wb.Sheets['Cash Flow sheet']
  if (!cashSheet) {
    result.warnings.push('Sheet "cash Flow sheet" not found — historical cashflows will be empty')
  }
  const cashRows = cashSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(cashSheet) : []

  const inactiveNames = fundRows
    .filter((f) => String(f['Status'] ?? '').toLowerCase() === 'inactive')
    .map((f) => fundNameFromRow(f))
    .filter(Boolean)
  if (inactiveNames.length) {
    result.warnings.push(
      `Inactive funds (${inactiveNames.join(', ')}) had purchaseStartDate set to the earliest non-zero ` +
        `cashflow in the sheet (or default 2025-11-13). If you bought these earlier, update purchaseStartDate via PATCH /api/holdings/:id.`
    )
  }

  if (options.dryRun) {
    result.warnings.push(`DRY RUN: would import ${fundRows.length} funds, ${cashRows.length} cashflow source rows`)
    return result
  }

  const defaultStart = new Date('2025-11-13T00:00:00.000Z')
  const eurRate = 25

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userProfile.findFirst({ where: { id: 'default' } })
    if (existing) {
      await tx.userProfile.update({
        where: { id: existing.id },
        data: { sipDayOfMonth: 14 }
      })
    } else {
      await tx.userProfile.create({
        data: {
          id: 'default',
          fullName: 'Gopinath Raja',
          dateOfBirth: new Date('1994-05-31'),
          homeCurrency: 'CZK',
          taxResidency: 'CZ',
          monthlyNetIncomeCzk: monthlySipTarget * 3,
          salaryDayOfMonth: 15,
          sipDayOfMonth: 14,
          emergencyFundTarget: 120_000,
          retirementAge: 50,
          retirementMonthlyExpense: 30_000
        }
      })
    }
    result.profileUpdated = true

    const settings = await tx.settings.findFirst()
    if (settings) {
      await tx.settings.update({
        where: { id: settings.id },
        data: {
          targetEquityPct: equityTarget,
          targetBondsPct: bondsTarget,
          targetCashPct: cashTarget,
          demoModeEnabled: false
        }
      })
    }

    for (const f of fundRows) {
      const notationId = String(f['Fund ID'] ?? '').trim()
      if (!notationId) continue
      const isin = notationId.split('-')[0]
      const name = fundNameFromRow(f) || isin
      const categoryRaw = String(f['Category'] ?? f['Cat'] ?? '').toLowerCase()
      const category =
        categoryRaw === 'equity'
          ? 'EQUITY'
          : categoryRaw === 'bonds'
            ? 'BONDS'
            : categoryRaw === 'cash'
              ? 'CASH'
              : 'EQUITY'
      const monthlySip = monthlySipFromRow(f)
      const units = Number(f['Units'] ?? 0)
      const nav = Number(f['NAV'] ?? 0)
      const value = Number(f['Value'] ?? (units && nav ? units * nav : 0))
      const statusRaw = String(f['Status'] ?? 'Active').toLowerCase()
      const status = statusRaw === 'active' ? 'ACTIVE' : 'INACTIVE'

      const earliestCashflow = findEarliestCashflowDate(cashRows, notationId)
      const purchaseStartDate = earliestCashflow ?? defaultStart
      const taxFreeDate = new Date(purchaseStartDate.getTime() + 1095 * 86400000)

      const existingHolding = await tx.holding.findFirst({ where: { isin } })

      const holdingData = {
        isin,
        name,
        type: 'MUTUAL_FUND',
        category,
        units: new Decimal(units),
        nav: new Decimal(nav),
        currency: 'CZK',
        currentValueCzk: new Decimal(value),
        monthlySipCzk: new Decimal(monthlySip),
        status,
        purchaseStartDate,
        taxFreeDate,
        country: 'CZ',
        navSourceType: 'ERSTE',
        navSourceId: notationId,
        holdReason: status === 'INACTIVE' ? 'TACTICAL_HOLD' : null,
        updatedAt: new Date()
      }

      if (existingHolding) {
        await tx.holding.update({
          where: { id: existingHolding.id },
          data: holdingData
        })
      } else {
        await tx.holding.create({
          data: {
            id: `hld-${isin}`,
            ...holdingData,
            createdAt: new Date()
          }
        })
      }
      result.fundsImported++
    }

    for (const c of cashRows) {
      const notationId = String(c['Fund ID'] ?? '').trim()
      if (!notationId) continue
      const isin = notationId.split('-')[0]
      const holding = await tx.holding.findFirst({ where: { isin } })
      if (!holding) {
        result.warnings.push(`Cashflow row skipped: no holding for ISIN ${isin}`)
        continue
      }

      for (const [colName, rawValue] of Object.entries(c)) {
        const match = colName.match(FUND_INVESTED_RE)
        if (!match) continue
        const [, day, month, year] = match
        const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
        const amount = Number(rawValue)
        if (!Number.isFinite(amount) || amount === 0) continue

        const amountCzk = new Decimal(amount < 0 ? amount : -Math.abs(amount))
        await tx.cashflow.create({
          data: {
            holdingId: holding.id,
            date,
            amountCzk,
            type: 'SIP',
            notes: 'Imported from Banking_Input.xlsx'
          }
        })
        result.cashflowsImported++
      }
    }

    const totalCzk = fundRows.reduce((sum, row) => sum + Number(row['Value'] ?? 0), 0)
    const snapDate = new Date()
    snapDate.setUTCHours(0, 0, 0, 0)
    const investedGuess = totalCzk * 0.95
    const gainGuess = totalCzk * 0.05

    await tx.snapshot.upsert({
      where: { date: snapDate },
      create: {
        date: snapDate,
        netWorthCzk: new Decimal(totalCzk),
        netWorthEur: new Decimal(totalCzk / eurRate),
        investedCzk: new Decimal(investedGuess),
        gainCzk: new Decimal(gainGuess),
        gainPct: new Decimal(5),
        equityPct: new Decimal(equityTarget),
        bondsPct: new Decimal(bondsTarget),
        cashPct: new Decimal(cashTarget),
        healthScore: 0,
        confidenceScore: 0,
        xirrIsEstimate: true
      },
      update: {
        netWorthCzk: new Decimal(totalCzk),
        netWorthEur: new Decimal(totalCzk / eurRate),
        investedCzk: new Decimal(investedGuess),
        gainCzk: new Decimal(gainGuess),
        gainPct: new Decimal(5),
        equityPct: new Decimal(equityTarget),
        bondsPct: new Decimal(bondsTarget),
        cashPct: new Decimal(cashTarget),
        xirrIsEstimate: true
      }
    })
  })

  return result
}
