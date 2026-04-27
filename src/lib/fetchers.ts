import axios from 'axios'
import { prisma } from './prisma'

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

export async function fetchCNBRates(): Promise<{ EURCZK: number } | null> {
  try {
    const url =
      'https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt'
    const res = await axios.get(url, { timeout: TIMEOUT })
    const lines = (res.data as string).split('\n')
    for (const line of lines) {
      const parts = line.split('|')
      if (parts[3] === 'EUR') {
        const rate = parseFloat(parts[4])
        if (!isNaN(rate) && rate > 20 && rate < 35) return { EURCZK: rate }
      }
    }
    return null
  } catch {
    return null
  }
}

export async function fetchECBRate(currency: string): Promise<number | null> {
  try {
    const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A?lastNObservations=1&format=jsondata`
    const res = await axios.get(url, { timeout: TIMEOUT })
    const val = res.data?.dataSets?.[0]?.series?.['0:0:0:0:0']?.observations?.['0']?.[0]
    return typeof val === 'number' && val > 0 ? val : null
  } catch {
    return null
  }
}

export async function getFXRates(): Promise<{
  EURCZK: number
  EURINR: number
  source: string
  ageHours: number
}> {
  const cnb = await fetchCNBRates()
  const ecb = await fetchECBRate('INR')

  if (cnb && ecb) {
    await saveFXToHistory(cnb.EURCZK, ecb).catch(() => {})
    return { EURCZK: cnb.EURCZK, EURINR: ecb, source: 'live', ageHours: 0 }
  }

  const cached = await getCachedFX()
  if (cached) return { ...cached, source: 'cached' }

  return { ...FALLBACK_RATES, source: 'fallback', ageHours: 999 }
}

async function saveFXToHistory(eurczk: number, eurinr: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.priceHistory.upsert({
    where: { isin_date: { isin: 'FX_EURCZK', date: today } },
    update: { price: eurczk },
    create: {
      isin: 'FX_EURCZK',
      date: today,
      price: eurczk,
      currency: 'CZK',
      source: 'CNB'
    }
  })
  await prisma.priceHistory.upsert({
    where: { isin_date: { isin: 'FX_EURINR', date: today } },
    update: { price: eurinr },
    create: {
      isin: 'FX_EURINR',
      date: today,
      price: eurinr,
      currency: 'INR',
      source: 'ECB'
    }
  })
}

async function getCachedFX() {
  try {
    const czk = await prisma.priceHistory.findFirst({
      where: { isin: 'FX_EURCZK' },
      orderBy: { date: 'desc' }
    })
    const inr = await prisma.priceHistory.findFirst({
      where: { isin: 'FX_EURINR' },
      orderBy: { date: 'desc' }
    })
    if (!czk || !inr) return null
    const ageHours = (Date.now() - czk.date.getTime()) / 3600000
    return { EURCZK: czk.price, EURINR: inr.price, ageHours }
  } catch {
    return null
  }
}

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
  return cached?.price ?? null
}
