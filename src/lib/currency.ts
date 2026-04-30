import axios from 'axios'
import { prisma } from './prisma'
import { num } from './money'

const TIMEOUT = 8000
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FALLBACK = { EUR: 25.0, USD: 23.0, INR: 0.28 }

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

  const toCzk = async (ccy: string, v: number): Promise<number> => {
    if (ccy === 'CZK') return v
    const row = await latestCzkPerUnit(ccy as 'EUR' | 'USD' | 'INR')
    if (!row) throw new Error('No FX rate in database')
    if (Date.now() - row.fetchedAt.getTime() > MAX_AGE_MS) {
      throw new Error('FX rate is older than 7 days. Refresh rates or run fetchAllRates().')
    }
    return v * row.rate
  }
  const fromCzk = async (ccy: string, czk: number): Promise<number> => {
    if (ccy === 'CZK') return czk
    const row = await latestCzkPerUnit(ccy as 'EUR' | 'USD' | 'INR')
    if (!row) throw new Error('No FX rate in database')
    if (Date.now() - row.fetchedAt.getTime() > MAX_AGE_MS) {
      throw new Error('FX rate is older than 7 days.')
    }
    return czk / row.rate
  }
  const czkVal = await toCzk(a, amount)
  return fromCzk(b, czkVal)
}

export async function getRateAge(): Promise<{ stalest: number; freshest: number }> {
  const quotes: ('EUR' | 'USD' | 'INR')[] = ['EUR', 'USD', 'INR']
  const ages: number[] = []
  for (const q of quotes) {
    const r = await latestCzkPerUnit(q)
    if (r) ages.push(Date.now() - r.fetchedAt.getTime())
  }
  if (ages.length === 0) return { stalest: 999_999, freshest: 999_999 }
  const m = (ms: number) => Math.round(ms / 60_000)
  return { stalest: m(Math.max(...ages)), freshest: m(Math.min(...ages)) }
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
  const latest = await prisma.fXRate.findFirst({
    where: { base: 'CZK', quote: 'EUR' },
    orderBy: { fetchedAt: 'desc' }
  })
  if (!latest) return true
  return Date.now() - latest.fetchedAt.getTime() > hours * 3_600_000
}

export async function ensureFreshRatesIfStale(maxAgeHours = 24): Promise<CoreFx | null> {
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
