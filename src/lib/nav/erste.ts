import { Prisma } from '@prisma/client'

export interface ErsteNavResult {
  value: Prisma.Decimal | null
  fetchedAt: Date
  error?: string
}

/** Live NAV from Erste `mig.erstegroup.com` GraphQL (notation ID from IC workflow). */
export async function fetchErsteNav(notationId: string): Promise<ErsteNavResult> {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const body = [
    {
      operationName: 'ApiTableInstruments',
      variables: { notationIds: [notationId], language: 'CS' },
      query: `query ApiTableInstruments($notationIds: [NotationId!]!, $language: Language) {
        instruments(notationIds: $notationIds, language: $language) {
          notation {
            tradingInfo {
              p1DCustom(periodStart: "${fmt(thirtyDaysAgo)}", periodEnd: "${fmt(today)}") {
                objects { last { price { value } } }
              }
            }
          }
        }
      }`
    }
  ]

  try {
    const response = await fetch('https://mig.erstegroup.com/gql/cz-mdp/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.investicnicentrum.cz',
        Referer: 'https://www.investicnicentrum.cz/'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      return { value: null, fetchedAt: new Date(), error: `HTTP ${response.status}` }
    }

    const json = (await response.json()) as unknown[]
    const row0 = json?.[0] as {
      data?: {
        instruments?: Array<{
          notation?: { tradingInfo?: { p1DCustom?: { objects?: Array<{ last?: { price?: { value?: number } } }> } } }
        }>
      }
    }
    const objects = row0?.data?.instruments?.[0]?.notation?.tradingInfo?.p1DCustom?.objects || []
    if (objects.length === 0) {
      return { value: null, fetchedAt: new Date(), error: 'No NAV objects in response' }
    }

    const last = objects[objects.length - 1]
    const value = last?.last?.price?.value
    if (value == null) {
      return { value: null, fetchedAt: new Date(), error: 'No price.value in last object' }
    }

    return { value: new Prisma.Decimal(value), fetchedAt: new Date() }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { value: null, fetchedAt: new Date(), error: msg }
  }
}

/** Daily NAV series for bulk historical import (Erste GraphQL; dates interpolated if API omits them). */
export async function fetchErsteHistoricalNavs(
  notationId: string
): Promise<Array<{ date: Date; nav: number }>> {
  const today = new Date()
  const start = new Date(today.getTime() - 10 * 365.25 * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const body = [
    {
      operationName: 'ApiTableInstruments',
      variables: { notationIds: [notationId], language: 'CS' },
      query: `query ApiTableInstruments($notationIds: [NotationId!]!, $language: Language) {
        instruments(notationIds: $notationIds, language: $language) {
          notation {
            tradingInfo {
              p1DCustom(periodStart: "${fmt(start)}", periodEnd: "${fmt(today)}") {
                objects { last { price { value } } }
              }
            }
          }
        }
      }`
    }
  ]

  const response = await fetch('https://mig.erstegroup.com/gql/cz-mdp/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.investicnicentrum.cz',
      Referer: 'https://www.investicnicentrum.cz/'
    },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(`Erste historical HTTP ${response.status}`)
  }
  const json = (await response.json()) as unknown[]
  const row0 = json?.[0] as {
    data?: {
      instruments?: Array<{
        notation?: { tradingInfo?: { p1DCustom?: { objects?: Array<{ last?: { price?: { value?: number } } }> } } }
      }>
    }
  }
  const objects =
    row0?.data?.instruments?.[0]?.notation?.tradingInfo?.p1DCustom?.objects || []
  const out: Array<{ date: Date; nav: number }> = []
  const span = today.getTime() - start.getTime()
  const n = objects.length
  for (let i = 0; i < n; i++) {
    const v = objects[i]?.last?.price?.value
    if (v == null || !Number.isFinite(v)) continue
    const t =
      n <= 1
        ? new Date(today)
        : new Date(start.getTime() + (span * i) / Math.max(n - 1, 1))
    out.push({ date: t, nav: v })
  }
  return out
}
