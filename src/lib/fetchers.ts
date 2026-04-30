import axios from 'axios'
import { prisma } from './prisma'
import { num } from './money'
import { ensureFreshRatesIfStale } from './currency'

const FALLBACK_RATES = { EURCZK: 24.5, EURINR: 89.0 }
const TIMEOUT = 5000 // 5 seconds max per request

export async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    const price = res.data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

/**
 * Cross rates for portfolio / legacy callers (same shape as before F1.5).
 * Reads **only** `FXRate` (via `ensureFreshRatesIfStale`); never `PriceHistory`.
 */
export async function getFXRates(): Promise<{
  EURCZK: number
  EURINR: number
  source: string
  ageHours: number
}> {
  try {
    await ensureFreshRatesIfStale(48)
  } catch {
    // Use whatever FX rows already exist
  }

  const eur = await prisma.fXRate.findFirst({
    where: { base: 'CZK', quote: 'EUR' },
    orderBy: { fetchedAt: 'desc' }
  })
  const inr = await prisma.fXRate.findFirst({
    where: { base: 'CZK', quote: 'INR' },
    orderBy: { fetchedAt: 'desc' }
  })

  if (!eur || !inr) {
    return { ...FALLBACK_RATES, source: 'fallback', ageHours: 999 }
  }

  const EURCZK = num(eur.rate)
  const EURINR =
    num(inr.rate) > 0 && num(eur.rate) > 0 ? num(eur.rate) / num(inr.rate) : FALLBACK_RATES.EURINR
  const oldestMs = Math.min(eur.fetchedAt.getTime(), inr.fetchedAt.getTime())
  const ageHours = (Date.now() - oldestMs) / 3600000

  let source = 'cached'
  if (eur.source === 'FALLBACK' || inr.source === 'FALLBACK') source = 'fallback'
  else if (!eur.stale && !inr.stale && ageHours < 48) source = 'live'

  return { EURCZK, EURINR, source, ageHours }
}

/*
 * REMOVED 2026-05-01 (F1.5): Previously `saveFXToHistory` wrote FX_EURCZK / FX_EURINR into
 * `PriceHistory`, duplicating `FXRate` from `currency.fetchAllRates`. Callers now refresh
 * via `ensureFreshRatesIfStale` / `fetchAllRates` only.
 *
 * async function saveFXToHistory(eurczk: number, eurinr: number) { ... }
 * async function getCachedFX() { ... read PriceHistory ... }
 */

export async function getHoldingPrice(isin: string, ticker?: string): Promise<number | null> {
  if (!ticker) return null

  const price = await fetchYahooPrice(ticker)
  if (price) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await prisma.priceHistory
      .upsert({
        where: { isin_date: { isin, date: today } },
        update: { price },
        create: { isin, date: today, price, currency: 'EUR', source: 'yahoo' }
      })
      .catch(() => {})
    return price
  }

  const cached = await prisma.priceHistory.findFirst({
    where: { isin },
    orderBy: { date: 'desc' }
  })
  return cached?.price != null ? num(cached.price) : null
}
