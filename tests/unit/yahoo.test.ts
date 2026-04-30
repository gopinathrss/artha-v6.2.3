import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchYahooNav } from '../../src/lib/nav/yahoo'

describe('fetchYahooNav', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses chart result last close', async () => {
    const body = {
      chart: {
        result: [
          {
            indicators: {
              quote: [{ close: [99.1, 100.25, null, 101.4] }]
            }
          }
        ]
      }
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => body
      })
    )
    const r = await fetchYahooNav('SWDA.L')
    expect(r.error).toBeUndefined()
    expect(Number(r.value)).toBeCloseTo(101.4, 4)
  })

  it('returns error when chart empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ chart: {} })
      })
    )
    const r = await fetchYahooNav('X')
    expect(r.value).toBeNull()
    expect(r.error).toMatch(/No chart/)
  })
})
