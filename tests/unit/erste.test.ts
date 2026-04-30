import { describe, expect, it, vi, afterEach } from 'vitest'
import { ERSTE_FUNDS } from '../fixtures/erste-funds'
import { fetchErsteNav } from '../../src/lib/nav/erste'

describe('fetchErsteNav', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses GraphQL array response and returns Decimal value', async () => {
    const sample = [
      {
        data: {
          instruments: [
            {
              notation: {
                tradingInfo: {
                  p1DCustom: {
                    objects: [{ last: { price: { value: 1.0523 } } }, { last: { price: { value: 1.0601 } } }]
                  }
                }
              }
            }
          ]
        }
      }
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => sample
      })
    )
    const r = await fetchErsteNav(ERSTE_FUNDS[0]!.notationId)
    expect(r.error).toBeUndefined()
    expect(r.value?.toString()).toBe('1.0601')
  })

  it('returns error on empty objects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ data: { instruments: [{ notation: { tradingInfo: { p1DCustom: { objects: [] } } } }] } }]
      })
    )
    const r = await fetchErsteNav('X')
    expect(r.value).toBeNull()
    expect(r.error).toMatch(/No NAV/)
  })
})
