import axios from 'axios'
import { prisma } from './prisma'
import { num } from './money'

const TIMEOUT = 8000
const FALLBACK = { EUR: 25.0, USD: 23.0, INR: 0.28 }

/** FX older than this (hours) → health WARN, `convertCurrency` logs a warning. */
export const FX_STALENESS_WARN_HOURS = 24
/** FX older than this (hours) → health FAIL, `convertCurrency` throws. */
export const FX_STALENESS_FAIL_HOURS = 168

/**
 * Hours since the **stalest** of the latest CZK↔EUR/USD/INR `FXRate` rows (worst leg).
 * Single source of truth for FX age (F2.5 / F2.6).
 */
export async function getFxAgeHours(): Promise<number> {
  const quotes = ['EUR', 'USD', 'INR'] as const
  let maxH = 0
  let found = 0
  for (const q of quotes) {
    const row = await prisma.fXRate.findFirst({
      where: { base: 'CZK', quote: q },
      orderBy: { fetchedAt: 'desc' }
    })
    if (!row) continue
    found++
    const h = (Date.now() - row.fetchedAt.getTime()) / 3_600_000
    if (h > maxH) maxH = h
  }
  if (found === 0) return Number.POSITIVE_INFINITY
  return maxH
}

export type CoreFx = {
  EUR: number
  USD: number
  INR: number
  fetchedAt: Date
  stale: boolean
  source: string
}

async function parseCNBDaily(): Promise<{ EUR: number; USD: number } | null> {
  try {
    const url =
      'https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt'
    const res = await axios.get<string>(url, { timeout: TIMEOUT })
    let eur: number | null = null
    let usd: number | null = null
    for (const line of (res.data as string).split('\n')) {
      const parts = line.split('|')
      if (parts.length < 5) continue
      const code = parts[3]
      const r = parseFloat(parts[4] ?? '')
      const amt = parseFloat(parts[2] ?? '1') || 1
      if (code === 'EUR' && !isNaN(r) && r > 15 && r < 40) eur = r / amt
      if (code === 'USD' && !isNaN(r) && r > 15 && r < 40) usd = r / amt
    }
    if (eur == null || usd == null) return null
    return { EUR: eur, USD: usd }
  } catch {
    return null
  }
}

async function fetchEcbInrPerEur(): Promise<number | null> {
  try {
    const url =
      'https://data-api.ecb.europa.eu/service/data/EXR/D.INR.EUR.SP00.A?lastNObservations=1&format=jsondata'
    const res = await axios.get(url, { timeout: TIMEOUT })
    const val = res.data?.dataSets?.[0]?.series?.['0:0:0:0:0']?.observations?.['0']?.[0]
    if (typeof val === 'number' && val > 0) return val
    return null
  } catch {
    return null
  }
}

function czkPerInrFromEur(eurCzk: number, inrPerEur: number): number {
  if (inrPerEur <= 0) return FALLBACK.INR
  return eurCzk / inrPerEur
}

async function fetchExchangeRateApiFallback(czkPerEur: number): Promise<{ USD: number; INR: number } | null> {
  const key = process.env.EXCHANGE_RATE_API_KEY
  if (!key) return null
  try {
    const urlEurUsd = `https://v6.exchangerate-api.com/v6/${key}/pair/EUR/USD`
    const urlEurInr = `https://v6.exchangerate-api.com/v6/${key}/pair/EUR/INR`
    const [eUsd, eInr] = await Promise.all([
      axios.get(urlEurUsd, { timeout: TIMEOUT }),
      axios.get(urlEurInr, { timeout: TIMEOUT })
    ])
    const usdPerEur = eUsd.data?.conversion_rate
    const inrPerEur = eInr.data?.conversion_rate
    if (typeof usdPerEur !== 'number' || typeof inrPerEur !== 'number') return null
    return { USD: czkPerEur / usdPerEur, INR: czkPerEur / inrPerEur }
  } catch {
    return null
  }
}

export async function fetchAllRates(): Promise<CoreFx> {
  const now = new Date()
  let eur: number
  let usd: number
  let inr: number
  let source = 'FALLBACK'
  let stale = true

  const cnb = await parseCNBDaily()
  const inrPerEur = await fetchEcbInrPerEur()

  if (cnb && inrPerEur) {
    eur = cnb.EUR
    usd = cnb.USD
    inr = czkPerInrFromEur(cnb.EUR, inrPerEur)
    source = 'CNB+ECB'
    stale = false
  } else if (cnb) {
    eur = cnb.EUR
    usd = cnb.USD
    inr = czkPerInrFromEur(cnb.EUR, 92)
    source = inrPerEur ? 'CNB+ECB' : 'CNB+INR_EST'
    stale = inrPerEur == null
  } else {
    const api = await fetchExchangeRateApiFallback(FALLBACK.EUR)
    if (api) {
      eur = FALLBACK.EUR
      usd = api.USD
      inr = api.INR
      source = 'EXCHANGERATE-API'
      stale = false
    } else {
      eur = FALLBACK.EUR
      usd = FALLBACK.USD
      inr = FALLBACK.INR
      source = 'FALLBACK'
      stale = true
    }
  }

  const base = 'CZK'
  for (const [quote, rate, src, st] of [
    ['EUR' as const, eur, source, stale],
    ['USD' as const, usd, source, stale],
    ['INR' as const, inr, source, stale]
  ] as const) {
    await prisma.fXRate.create({
      data: { base, quote, rate, source: src, stale: st, fetchedAt: now }
    })
  }

  return { EUR: eur, USD: usd, INR: inr, fetchedAt: now, stale, source }
}

/** Latest row from `FXRate` (single source of truth for FX; see F1.5). */
export async function getLatestFXRate(
  base: string,
  quote: string
): Promise<{ rate: number; fetchedAt: Date; stale: boolean; source: string } | null> {
  const b = (base || 'CZK').toUpperCase()
  const q = (quote || '').toUpperCase()
  if (b !== 'CZK' || (q !== 'EUR' && q !== 'USD' && q !== 'INR')) return null
  const row = await prisma.fXRate.findFirst({
    where: { base: 'CZK', quote: q as 'EUR' | 'USD' | 'INR' },
    orderBy: { fetchedAt: 'desc' }
  })
  if (!row) return null
  return { rate: num(row.rate), fetchedAt: row.fetchedAt, stale: row.stale, source: row.source }
}

function latestCzkPerUnit(quote: 'EUR' | 'USD' | 'INR') {
  return getLatestFXRate('CZK', quote)
}

export async function convertCurrency(amount: number, fromCcy: string, toCcy: string): Promise<number> {
  const a = (fromCcy || 'CZK').toUpperCase()
  const b = (toCcy || 'CZK').toUpperCase()
  if (a === b) return amount

  const fxAge = await getFxAgeHours()
  if (fxAge > FX_STALENESS_FAIL_HOURS) {
    throw new Error(
      `FX data is older than ${FX_STALENESS_FAIL_HOURS}h (~${fxAge.toFixed(1)}h). Refresh via /api/currency/refresh or fetchAllRates().`
    )
  }
  if (fxAge > FX_STALENESS_WARN_HOURS) {
    // eslint-disable-next-line no-console
    console.warn(`[currency] FX age ${fxAge.toFixed(1)}h exceeds warn threshold ${FX_STALENESS_WARN_HOURS}h; conversion proceeds.`)
  }

  const toCzk = async (ccy: string, v: number): Promise<number> => {
    if (ccy === 'CZK') return v
    const row = await latestCzkPerUnit(ccy as 'EUR' | 'USD' | 'INR')
    if (!row) throw new Error('No FX rate in database')
    return v * row.rate
  }
  const fromCzk = async (ccy: string, czk: number): Promise<number> => {
    if (ccy === 'CZK') return czk
    const row = await latestCzkPerUnit(ccy as 'EUR' | 'USD' | 'INR')
    if (!row) throw new Error('No FX rate in database')
    return czk / row.rate
  }
  const czkVal = await toCzk(a, amount)
  return fromCzk(b, czkVal)
}

/** Age of each CZK quote leg in minutes (API compat); derived from same rows as `getFxAgeHours`. */
export async function getRateAge(): Promise<{ stalest: number; freshest: number }> {
  const quotes: ('EUR' | 'USD' | 'INR')[] = ['EUR', 'USD', 'INR']
  const agesMs: number[] = []
  for (const q of quotes) {
    const r = await latestCzkPerUnit(q)
    if (r) agesMs.push(Date.now() - r.fetchedAt.getTime())
  }
  if (agesMs.length === 0) return { stalest: 999_999, freshest: 999_999 }
  const toMin = (ms: number) => Math.round(ms / 60_000)
  return { stalest: toMin(Math.max(...agesMs)), freshest: toMin(Math.min(...agesMs)) }
}

export function formatCurrency(amount: number, currency: string): string {
  const c = (currency || 'CZK').toUpperCase()
  if (c === 'CZK') {
    const n = Math.round(amount)
    return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Kč`
  }
  if (c === 'EUR') {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
      amount
    )
  }
  if (c === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount
    )
  }
  if (c === 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      amount
    )
  }
  return `${amount.toFixed(2)} ${c}`
}

export async function needsFetchWithin(hours: number): Promise<boolean> {
  const age = await getFxAgeHours()
  return !Number.isFinite(age) || age > hours
}

export async function ensureFreshRatesIfStale(maxAgeHours = FX_STALENESS_WARN_HOURS): Promise<CoreFx | null> {
  if (await needsFetchWithin(maxAgeHours)) {
    return fetchAllRates()
  }
  const e = await latestCzkPerUnit('EUR')
  const u = await latestCzkPerUnit('USD')
  const i = await latestCzkPerUnit('INR')
  if (!e || !u || !i) return fetchAllRates()
  return {
    EUR: e.rate,
    USD: u.rate,
    INR: i.rate,
    fetchedAt: e.fetchedAt,
    stale: false,
    source: 'CACHED'
  }
}
