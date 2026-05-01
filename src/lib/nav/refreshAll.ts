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

export async function refreshAllCzechNavs(holdingId?: string): Promise<NavRefreshResult> {
  const prisma = await getPrisma()
  const holdings = await prisma.holding.findMany({
    where: {
      status: 'ACTIVE',
      ...(holdingId ? { id: holdingId } : {})
    }
  })

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
