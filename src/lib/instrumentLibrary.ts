import { Prisma, type Holding, type InstrumentLibrary, type PrismaClient } from '@prisma/client'
import { getPrisma } from './prisma'
import { num } from './money'

export function scoreInstrument(instrument: {
  return1yr?: number | string | null | Prisma.Decimal
  return3yr?: number | string | null | Prisma.Decimal
  return5yr?: number | string | null | Prisma.Decimal
  return10yr?: number | string | null | Prisma.Decimal
  terPct?: number | string | null | Prisma.Decimal
  fundSizeM?: number | string | null | Prisma.Decimal
  trackingError?: number | string | null | Prisma.Decimal
}): number {
  const r3 = num(instrument.return3yr ?? instrument.return1yr ?? 0)
  const returnScore = Math.min(30, (r3 / 15) * 30)
  const ter = num(instrument.terPct ?? 2.5)
  const terScore = Math.max(0, 25 - (ter / 2.5) * 25)
  const aum = num(instrument.fundSizeM)
  const aumScore = !aum
    ? 5
    : aum < 100
      ? 5
      : aum < 500
        ? 10
        : aum < 1000
          ? 15
          : aum < 5000
            ? 18
            : 20
  const te = instrument.trackingError == null ? null : num(instrument.trackingError)
  const trackingScore = te == null
    ? 10
    : te < 0.1
      ? 15
      : te < 0.5
        ? 12
        : te < 1.0
          ? 8
          : 3
  const r10 = instrument.return10yr == null ? null : num(instrument.return10yr)
  const consistencyScore =
    r10 == null ? 5 : r10 > 8 ? 10 : r10 > 4 ? 7 : 3
  return Math.round(returnScore + terScore + aumScore + trackingScore + consistencyScore)
}

function currentHoldingScore(holding: Holding, library: InstrumentLibrary[]): number {
  const m = library.find((l) => l.isin === holding.isin)
  if (m != null) return m.score != null ? num(m.score) : scoreInstrument(m)
  if (holding.interestRatePct != null) {
    return Math.max(0, 50 - num(holding.interestRatePct) * 2)
  }
  return 45
}

export function findBestAlternative(
  holding: Holding,
  library: InstrumentLibrary[]
):
  | { instrument: InstrumentLibrary; scoreDiff: number; annualSavingCzk: number }
  | null {
  const cat = (holding.category || '').toUpperCase()
  const alts = library
    .filter(
      (l) =>
        (l.category || '').toUpperCase() === cat &&
        l.availableInGeorge &&
        l.isin !== holding.isin
    )
    .map((i) => ({ i, s: i.score != null ? num(i.score) : scoreInstrument(i) }))
    .sort((a, b) => b.s - a.s)
  if (alts.length === 0) return null
  const best = alts[0]!.i
  const bestScore = alts[0]!.s
  const base = currentHoldingScore(holding, library)
  if (bestScore < base + 10) return null
  const terH = num(library.find((l) => l.isin === holding.isin)?.terPct ?? 1.5) / 100
  const terA = num(best.terPct ?? 0) / 100
  const annualSavingCzk = Math.max(0, (terH - terA) * num(holding.currentValueCzk))
  return {
    instrument: best,
    scoreDiff: bestScore - base,
    annualSavingCzk: Math.round(annualSavingCzk)
  }
}

export interface FXRates {
  EURCZK: number
  EURINR: number
}

export interface ComparisonResult {
  yourFund: { isin: string; name: string; terPct: number | null; score: number; valueCzk: number }
  alternative: { isin: string; name: string; terPct: number | null; score: number }
  feeDiffPct: number
  return3yrDiff: number
  scoreDiff: number
  annualCostYourCzk: number
  annualCostAltCzk: number
  annualSavingCzk: number
  fx: FXRates
}

export function compareFundToETF(
  holding: Holding,
  alternative: InstrumentLibrary,
  _fxRates: FXRates,
  library: InstrumentLibrary[] = []
): ComparisonResult {
  const fromLib = library.find((l) => l.isin === holding.isin)
  const yourTer = num(fromLib?.terPct ?? 1.4)
  const yScore = currentHoldingScore(holding, [...library, alternative])
  const aScore = alternative.score != null ? num(alternative.score) : scoreInstrument(alternative)
  const annualCostYourCzk = (yourTer / 100) * num(holding.currentValueCzk)
  const annualCostAltCzk = (num(alternative.terPct ?? 0) / 100) * num(holding.currentValueCzk)
  return {
    yourFund: {
      isin: holding.isin,
      name: holding.name,
      terPct: yourTer,
      score: yScore,
      valueCzk: num(holding.currentValueCzk)
    },
    alternative: {
      isin: alternative.isin,
      name: alternative.name,
      terPct: num(alternative.terPct),
      score: aScore
    },
    feeDiffPct: yourTer - num(alternative.terPct ?? 0),
    return3yrDiff: num(alternative.return3yr ?? 0) - num(fromLib?.return3yr ?? 0),
    scoreDiff: aScore - yScore,
    annualCostYourCzk: Math.round(annualCostYourCzk),
    annualCostAltCzk: Math.round(annualCostAltCzk),
    annualSavingCzk: Math.max(0, Math.round(annualCostYourCzk - annualCostAltCzk)),
    fx: { EURCZK: _fxRates.EURCZK, EURINR: _fxRates.EURINR }
  }
}

export async function getTopETFsByCategory(
  category: string,
  limit: number = 5
): Promise<InstrumentLibrary[]> {
  const prisma = await getPrisma()
  return prisma.instrumentLibrary.findMany({
    where: { category: category.toUpperCase() as any, availableInGeorge: true },
    orderBy: { score: 'desc' },
    take: limit
  })
}

/** Curated 30 — unique ISINs (duplicates in source spec resolved). Literals are numbers; Prisma coerces to `Decimal` on insert. */
export const TOP_ETF_SEED: Prisma.InstrumentLibraryCreateManyInput[] =
  [
    { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', ticker: 'SWDA.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global Equity', terPct: 0.2, currency: 'EUR', domicile: 'IE', fundSizeM: 85000, trackingError: 0.03, benchmark: 'MSCI World', availableInGeorge: true, return1yr: 22.4, return3yr: 11.8, return5yr: 13.2, return10yr: 11.9 },
    { isin: 'IE00BKM4GZ66', name: 'iShares Core MSCI EM IMI', ticker: 'EIMI.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Emerging Markets', terPct: 0.18, currency: 'EUR', domicile: 'IE', fundSizeM: 22000, trackingError: 0.12, benchmark: 'MSCI EM IMI', availableInGeorge: true, return1yr: 11.2, return3yr: 4.8, return5yr: 6.1, return10yr: 5.4 },
    { isin: 'IE00B3XXRP09', name: 'Vanguard S&P 500 UCITS ETF', ticker: 'VUSA.DE', type: 'ETF', category: 'EQUITY', subcategory: 'US Large Cap', terPct: 0.07, currency: 'USD', domicile: 'IE', fundSizeM: 48000, trackingError: 0.02, benchmark: 'S&P 500', availableInGeorge: true, return1yr: 24.1, return3yr: 13.4, return5yr: 15.8, return10yr: 13.2 },
    { isin: 'IE00B52MJY50', name: 'iShares Core S&P 500', ticker: 'CSPX.L', type: 'ETF', category: 'EQUITY', subcategory: 'US Large Cap', terPct: 0.07, currency: 'USD', domicile: 'IE', fundSizeM: 52000, trackingError: 0.02, benchmark: 'S&P 500', availableInGeorge: true, return1yr: 24, return3yr: 13.3, return5yr: 15.7, return10yr: 13.1 },
    { isin: 'IE00BFY0GT14', name: 'SPDR MSCI World Small Cap', ticker: 'WLDS.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global Small Cap', terPct: 0.45, currency: 'EUR', domicile: 'IE', fundSizeM: 2200, trackingError: 0.18, benchmark: 'MSCI World Small Cap', availableInGeorge: true, return1yr: 16.2, return3yr: 7.4, return5yr: 9.1, return10yr: 9.8 },
    { isin: 'IE00B3F81H35', name: 'iShares EUR Corp Bond', ticker: 'IEAC.DE', type: 'ETF', category: 'BONDS', subcategory: 'EUR Corporate Bond', terPct: 0.2, currency: 'EUR', domicile: 'IE', fundSizeM: 8500, trackingError: 0.05, benchmark: 'Bloomberg EUR Corp Bond', availableInGeorge: true, return1yr: 3.8, return3yr: 0.2, return5yr: 1.4, return10yr: 2.8 },
    { isin: 'IE00B14X4T88', name: 'iShares EUR Govt Bond 7-10yr', ticker: 'IBGX.DE', type: 'ETF', category: 'BONDS', subcategory: 'EUR Government Bond', terPct: 0.15, currency: 'EUR', domicile: 'IE', fundSizeM: 4200, trackingError: 0.04, benchmark: 'Bloomberg EUR Govt 7-10yr', availableInGeorge: true, return1yr: 1.2, return3yr: -3.4, return5yr: -1.2, return10yr: 1.8 },
    { isin: 'IE00B4WXJJ64', name: 'iShares Global Corp Bond Hdg', ticker: 'CRPH.DE', type: 'ETF', category: 'BONDS', subcategory: 'Global Corp Bond Hedged', terPct: 0.25, currency: 'EUR', domicile: 'IE', fundSizeM: 3100, trackingError: 0.08, benchmark: 'Bloomberg Global Corp Hdg EUR', availableInGeorge: true, return1yr: 4.2, return3yr: 0.8, return5yr: 2.1, return10yr: 3.2 },
    { isin: 'IE00B5BMR087', name: 'iShares Physical Gold', ticker: 'IGLN.DE', type: 'ETF', category: 'COMMODITY', subcategory: 'Gold', terPct: 0.12, currency: 'USD', domicile: 'IE', fundSizeM: 12000, trackingError: 0.01, benchmark: 'Gold spot price', availableInGeorge: true, return1yr: 28.4, return3yr: 14.2, return5yr: 12.8, return10yr: 8.4 },
    { isin: 'IE00BYWQWR46', name: 'iShares Core Global Agg Bond', ticker: 'AGGH.DE', type: 'ETF', category: 'BONDS', subcategory: 'Global Aggregate Hedged', terPct: 0.1, currency: 'EUR', domicile: 'IE', fundSizeM: 6800, trackingError: 0.06, benchmark: 'Bloomberg Global Agg EUR Hdg', availableInGeorge: true, return1yr: 3.1, return3yr: -0.8, return5yr: 0.9, return10yr: 2.2 },
    { isin: 'IE00B52VJ196', name: 'iShares MSCI Europe', ticker: 'IMEU.DE', type: 'ETF', category: 'EQUITY', subcategory: 'European Equity', terPct: 0.12, currency: 'EUR', domicile: 'IE', fundSizeM: 9200, trackingError: 0.04, benchmark: 'MSCI Europe', availableInGeorge: true, return1yr: 8.4, return3yr: 7.2, return5yr: 8.9, return10yr: 7.8 },
    { isin: 'IE00B3VVMM84', name: 'Vanguard FTSE All-World', ticker: 'VWRL.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global All-World', terPct: 0.22, currency: 'USD', domicile: 'IE', fundSizeM: 18000, trackingError: 0.05, benchmark: 'FTSE All-World', availableInGeorge: true, return1yr: 21.8, return3yr: 10.9, return5yr: 12.4, return10yr: 10.8 },
    { isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World Acc', ticker: 'VWCE.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global All-World Acc', terPct: 0.22, currency: 'USD', domicile: 'IE', fundSizeM: 22000, trackingError: 0.05, benchmark: 'FTSE All-World', availableInGeorge: true, return1yr: 21.9, return3yr: 11, return5yr: 12.5, return10yr: 10.9 },
    { isin: 'LU1681043599', name: 'Amundi MSCI World II', ticker: 'LCWL.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global Equity', terPct: 0.12, currency: 'EUR', domicile: 'LU', fundSizeM: 4800, trackingError: 0.06, benchmark: 'MSCI World', availableInGeorge: true, return1yr: 22.1, return3yr: 11.5, return5yr: 12.9, return10yr: null },
    { isin: 'IE00B6TLBW47', name: 'iShares MSCI World SRI', ticker: 'SUWS.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global ESG Equity', terPct: 0.2, currency: 'EUR', domicile: 'IE', fundSizeM: 2800, trackingError: 0.08, benchmark: 'MSCI World SRI', availableInGeorge: true, return1yr: 18.4, return3yr: 8.2, return5yr: 10.1, return10yr: null },
    { isin: 'IE00B66F4759', name: 'iShares Core MSCI Japan', ticker: 'IJPA.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Japan Equity', terPct: 0.15, currency: 'JPY', domicile: 'IE', fundSizeM: 3400, trackingError: 0.05, benchmark: 'MSCI Japan', availableInGeorge: true, return1yr: 12.8, return3yr: 10.4, return5yr: 8.2, return10yr: 7.6 },
    { isin: 'IE00B3RBWM25', name: 'Vanguard FTSE Developed World', ticker: 'VEVE.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Developed Markets', terPct: 0.12, currency: 'USD', domicile: 'IE', fundSizeM: 8900, trackingError: 0.04, benchmark: 'FTSE Developed', availableInGeorge: true, return1yr: 22.2, return3yr: 11.4, return5yr: 13, return10yr: 11.1 },
    { isin: 'IE00B14X4S71', name: 'iShares MSCI AC Far East ex-JP', ticker: 'IFFF.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Asia Pacific ex Japan', terPct: 0.74, currency: 'USD', domicile: 'IE', fundSizeM: 1200, trackingError: 0.18, benchmark: 'MSCI AC Far East ex-JP', availableInGeorge: true, return1yr: 9.4, return3yr: 2.8, return5yr: 4.1, return10yr: 5.2 },
    { isin: 'IE00B53QG562', name: 'iShares NASDAQ 100', ticker: 'CNDX.DE', type: 'ETF', category: 'EQUITY', subcategory: 'US Technology', terPct: 0.33, currency: 'USD', domicile: 'IE', fundSizeM: 12000, trackingError: 0.04, benchmark: 'NASDAQ-100', availableInGeorge: true, return1yr: 28.4, return3yr: 12.8, return5yr: 20.1, return10yr: 18.4 },
    { isin: 'IE00B4L5YC18', name: 'iShares Core S&P 500 Acc', ticker: 'CSPX.DE', type: 'ETF', category: 'EQUITY', subcategory: 'US Large Cap Acc', terPct: 0.07, currency: 'USD', domicile: 'IE', fundSizeM: 52000, trackingError: 0.02, benchmark: 'S&P 500', availableInGeorge: true, return1yr: 24.1, return3yr: 13.4, return5yr: 15.8, return10yr: 13.2 },
    { isin: 'IE00B3F81409', name: 'iShares EUR High Yield Corp Bond', ticker: 'IHYG.DE', type: 'ETF', category: 'BONDS', subcategory: 'EUR High Yield', terPct: 0.5, currency: 'EUR', domicile: 'IE', fundSizeM: 5600, trackingError: 0.12, benchmark: 'Markit iBoxx EUR Liq HY', availableInGeorge: true, return1yr: 6.8, return3yr: 3.2, return5yr: 3.8, return10yr: 4.4 },
    { isin: 'IE00B2Q88X52', name: 'iShares Physical Gold ETC (LSE)', ticker: 'IGLN.L', type: 'ETF', category: 'COMMODITY', subcategory: 'Gold ETC', terPct: 0.12, currency: 'USD', domicile: 'IE', fundSizeM: 12000, trackingError: 0.01, benchmark: 'Gold spot', availableInGeorge: true, return1yr: 28.4, return3yr: 14.2, return5yr: 12.8, return10yr: 8.4 },
    { isin: 'IE00BZ163G84', name: 'iShares MSCI World Small Cap Alt', ticker: 'WLDS.L', type: 'ETF', category: 'EQUITY', subcategory: 'Global Small Cap', terPct: 0.35, currency: 'USD', domicile: 'IE', fundSizeM: 3400, trackingError: 0.15, benchmark: 'MSCI World Small Cap', availableInGeorge: true, return1yr: 16.4, return3yr: 7.6, return5yr: 9.4, return10yr: 10.1 },
    { isin: 'LU0908500753', name: 'Amundi S&P 500 ESG', ticker: '500ESG.PA', type: 'ETF', category: 'EQUITY', subcategory: 'US ESG', terPct: 0.12, currency: 'EUR', domicile: 'LU', fundSizeM: 2100, trackingError: 0.08, benchmark: 'S&P 500 ESG', availableInGeorge: true, return1yr: 22.8, return3yr: 11.2, return5yr: 14.1, return10yr: null },
    { isin: 'IE00B8X9K012', name: 'iShares Core MSCI World USD Hdg', ticker: 'IWDH.DE', type: 'ETF', category: 'EQUITY', subcategory: 'Global Equity USD Hedged', terPct: 0.55, currency: 'EUR', domicile: 'IE', fundSizeM: 1800, trackingError: 0.08, benchmark: 'MSCI World USD Hedged', availableInGeorge: true, return1yr: 18.2, return3yr: 9.4, return5yr: 11.2, return10yr: null },
    { isin: 'IE00B4X0QJ59', name: 'iShares Core MSCI Europe', ticker: 'IMEA.DE', type: 'ETF', category: 'EQUITY', subcategory: 'European Equity', terPct: 0.12, currency: 'EUR', domicile: 'IE', fundSizeM: 9800, trackingError: 0.04, benchmark: 'MSCI Europe', availableInGeorge: true, return1yr: 9.2, return3yr: 7.8, return5yr: 9.2, return10yr: 8.1 },
    { isin: 'IE00B1FZS350', name: 'iShares USD Treasury 7-10yr Hdg', ticker: 'IBTM.DE', type: 'ETF', category: 'BONDS', subcategory: 'US Treasury Hedged', terPct: 0.1, currency: 'EUR', domicile: 'IE', fundSizeM: 2800, trackingError: 0.04, benchmark: 'ICE US Treasury 7-10yr Hdg', availableInGeorge: true, return1yr: 2.4, return3yr: -2.8, return5yr: -0.8, return10yr: 1.4 },
    { isin: 'IE00B1C2PL88', name: 'iShares EUR Corp Bond 1-5yr', ticker: 'SE15.DE', type: 'ETF', category: 'BONDS', subcategory: 'EUR Short Corp', terPct: 0.2, currency: 'EUR', domicile: 'IE', fundSizeM: 4200, trackingError: 0.04, benchmark: 'Bloomberg EUR Corp 1-5yr', availableInGeorge: true, return1yr: 4.2, return3yr: 1.8, return5yr: 2.2, return10yr: 2.6 },
    { isin: 'IE00B0M91N52', name: 'iShares Diversified Commodity Swap', ticker: 'COMM.DE', type: 'ETF', category: 'COMMODITY', subcategory: 'Diversified Commodity', terPct: 0.19, currency: 'USD', domicile: 'IE', fundSizeM: 1600, trackingError: 0.12, benchmark: 'Bloomberg Commodity', availableInGeorge: true, return1yr: 4.8, return3yr: 2.4, return5yr: 5.2, return10yr: 1.8 },
    { isin: 'IE00B1C1HY88', name: 'Xtrackers EUR Corp Bond Hdg', ticker: 'XBLC.DE', type: 'ETF', category: 'BONDS', subcategory: 'EUR Corp Hedged', terPct: 0.16, currency: 'EUR', domicile: 'IE', fundSizeM: 2400, trackingError: 0.06, benchmark: 'Bloomberg EUR Corp Hdg', availableInGeorge: true, return1yr: 4.1, return3yr: 0.4, return5yr: 1.6, return10yr: 2.9 }
  ]

/** Rolling return % from `NavHistory` NAV points (null if insufficient history). */
export async function computeReturnsFromNavHistory(isin: string): Promise<{
  return1yr?: number | null
  return3yr?: number | null
  return5yr?: number | null
  return10yr?: number | null
}> {
  const prisma = await getPrisma()
  const rows = await prisma.navHistory.findMany({
    where: { isin },
    orderBy: { date: 'asc' }
  })
  if (rows.length < 2) return {}

  const navAt = (target: Date): number | null => {
    let best: { t: number; v: number } | null = null
    const tgt = target.getTime()
    for (const r of rows) {
      const t = new Date(r.date).getTime()
      const v = num(r.nav)
      if (!Number.isFinite(v) || v <= 0) continue
      const d = Math.abs(t - tgt)
      if (!best || d < best.t) best = { t: d, v }
    }
    return best?.v ?? null
  }

  const latest = rows[rows.length - 1]
  const lastNav = num(latest.nav)
  if (!Number.isFinite(lastNav) || lastNav <= 0) return {}

  const pct = (past: number | null) =>
    past != null && past > 0 && Number.isFinite(lastNav) ? ((lastNav / past - 1) * 100) : null

  const now = new Date()
  const y1 = new Date(now)
  y1.setFullYear(y1.getFullYear() - 1)
  const y3 = new Date(now)
  y3.setFullYear(y3.getFullYear() - 3)
  const y5 = new Date(now)
  y5.setFullYear(y5.getFullYear() - 5)
  const y10 = new Date(now)
  y10.setFullYear(y10.getFullYear() - 10)

  return {
    return1yr: pct(navAt(y1)),
    return3yr: pct(navAt(y3)),
    return5yr: pct(navAt(y5)),
    return10yr: pct(navAt(y10))
  }
}

/** F2.7: Recompute returns from `NavHistory` where possible, re-score via `scoreInstrument`, update `score` + `scoreUpdatedAt`. Used by monthly cron and `POST /api/library/refresh-scores`. */
export async function refreshAllLibraryScores(): Promise<{ updated: number; errors: number }> {
  const prisma = await getPrisma()
  const instruments = await prisma.instrumentLibrary.findMany()
  let updated = 0
  let errors = 0
  for (const inst of instruments) {
    try {
      const returns = await computeReturnsFromNavHistory(inst.isin)
      const merged = {
        return1yr: returns.return1yr ?? num(inst.return1yr),
        return3yr: returns.return3yr ?? num(inst.return3yr),
        return5yr: returns.return5yr ?? num(inst.return5yr),
        return10yr: returns.return10yr ?? (inst.return10yr != null ? num(inst.return10yr) : null),
        terPct: num(inst.terPct),
        fundSizeM: inst.fundSizeM != null ? num(inst.fundSizeM) : null,
        trackingError: inst.trackingError != null ? num(inst.trackingError) : null
      }
      const newScore = scoreInstrument({
        return1yr: merged.return1yr,
        return3yr: merged.return3yr,
        return5yr: merged.return5yr,
        return10yr: merged.return10yr,
        terPct: merged.terPct,
        fundSizeM: merged.fundSizeM,
        trackingError: merged.trackingError
      })
      await prisma.instrumentLibrary.update({
        where: { id: inst.id },
        data: {
          return1yr: merged.return1yr,
          return3yr: merged.return3yr,
          return5yr: merged.return5yr,
          return10yr: merged.return10yr,
          score: newScore,
          scoreUpdatedAt: new Date()
        }
      })
      updated++
    } catch {
      errors++
    }
  }
  return { updated, errors }
}

export async function seedLibraryWithTopETFs(db?: PrismaClient): Promise<void> {
  const prisma = db ?? (await getPrisma())
  const n = await prisma.instrumentLibrary.count()
  if (n > 0) return
  for (const row of TOP_ETF_SEED) {
    const sc = scoreInstrument(row as never)
    await prisma.instrumentLibrary.create({
      data: {
        ...row,
        return10yr: row.return10yr ?? null,
        score: sc,
        scoreUpdatedAt: new Date()
      } as any
    })
  }
  // eslint-disable-next-line no-console
  console.log(`[PIE] Instrument library seeded: ${TOP_ETF_SEED.length} instruments`)
}

export async function loadAllLibrary(): Promise<InstrumentLibrary[]> {
  const prisma = await getPrisma()
  return prisma.instrumentLibrary.findMany()
}
