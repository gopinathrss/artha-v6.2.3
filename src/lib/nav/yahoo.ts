import { Prisma } from '@prisma/client'

export interface YahooNavResult {
  value: Prisma.Decimal | null
  fetchedAt: Date
  error?: string
}

/** Last daily close from Yahoo chart API (ETF / listed instruments). */
export async function fetchYahooNav(ticker: string): Promise<YahooNavResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!response.ok) {
      return { value: null, fetchedAt: new Date(), error: `HTTP ${response.status}` }
    }
    const json = (await response.json()) as {
      chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: (number | null)[] }> } }> }
    }
    const result = json?.chart?.result?.[0]
    if (!result) return { value: null, fetchedAt: new Date(), error: 'No chart result' }
    const closes = result?.indicators?.quote?.[0]?.close || []
    const lastClose = closes[closes.length - 1]
    if (lastClose == null || typeof lastClose !== 'number') {
      return { value: null, fetchedAt: new Date(), error: 'No close price' }
    }
    return { value: new Prisma.Decimal(lastClose), fetchedAt: new Date() }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { value: null, fetchedAt: new Date(), error: msg }
  }
}
