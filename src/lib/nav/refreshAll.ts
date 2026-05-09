import type { Holding } from '@prisma/client'
import { getPrisma } from '../prisma'
import { d } from '../money'
import { fetchErsteNav } from './erste'
import { fetchYahooNav } from './yahoo'

export interface NavRefreshResult {
  totalHoldings: number
  refreshed: number
  failed: number
  skipped: number
  errors: { holdingId: string; error: string }[]
}

async function refreshHoldingsList(holdings: Holding[]): Promise<NavRefreshResult> {
  const prisma = await getPrisma()
  let refreshed = 0
  let failed = 0
  let skipped = 0
  const errors: { holdingId: string; error: string }[] = []

  for (const h of holdings) {
    const srcType = (h.navSourceType || '').toUpperCase()
    const srcId = h.navSourceId?.trim()
    if (!srcType || !srcId) {
      skipped++
      continue
    }
    if (srcType === 'MANUAL') {
      skipped++
      continue
    }

    let result: { value: { toString: () => string } | null; error?: string }
    if (srcType === 'ERSTE') {
      result = await fetchErsteNav(srcId)
    } else if (srcType === 'YAHOO') {
      result = await fetchYahooNav(srcId)
    } else {
      skipped++
      continue
    }

    if (result.value == null) {
      failed++
      errors.push({ holdingId: h.id, error: result.error || 'unknown' })
      continue
    }

    const navDec = d(result.value as never)
    const newValue = d(h.units).mul(navDec)

    const day = new Date()
    day.setUTCHours(0, 0, 0, 0)

    await prisma.holding.update({
      where: { id: h.id },
      data: {
        nav: navDec,
        currentValueCzk: newValue,
        navLastFetchedAt: new Date()
      }
    })

    await prisma.navHistory.upsert({
      where: { isin_date: { isin: h.isin, date: day } },
      update: { nav: navDec, currency: h.currency || 'CZK', source: srcType },
      create: {
        isin: h.isin,
        date: day,
        nav: navDec,
        currency: h.currency || 'CZK',
        source: srcType
      }
    })

    refreshed++
  }

  return {
    totalHoldings: holdings.length,
    refreshed,
    failed,
    skipped,
    errors
  }
}

/** All holdings with units &gt; 0 (any status), optionally a single holding by id. */
export async function refreshAllCzechNavs(holdingId?: string): Promise<NavRefreshResult> {
  const prisma = await getPrisma()
  const holdings = await prisma.holding.findMany({
    where: {
      units: { gt: 0 },
      ...(holdingId ? { id: holdingId } : {})
    }
  })
  return refreshHoldingsList(holdings)
}

/** Refresh NAV for every holding whose ISIN is in the list and units &gt; 0. */
export async function refreshNavForIsins(isins: string[]): Promise<NavRefreshResult> {
  const uniq = [...new Set(isins.map((i) => String(i || '').trim()).filter(Boolean))]
  if (uniq.length === 0) {
    return { totalHoldings: 0, refreshed: 0, failed: 0, skipped: 0, errors: [] }
  }
  const prisma = await getPrisma()
  const holdings = await prisma.holding.findMany({
    where: {
      isin: { in: uniq },
      units: { gt: 0 }
    }
  })
  return refreshHoldingsList(holdings)
}
