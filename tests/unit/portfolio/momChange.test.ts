import { describe, expect, it } from 'vitest'
import { findMomComparisonSnapshot, momChangeLabel } from '../../../src/lib/momChange'

const MS_DAY = 86400000

function snap(daysAgo: number, nw: number, now: Date) {
  return {
    date: new Date(now.getTime() - daysAgo * MS_DAY),
    netWorthCzk: nw
  }
}

describe('findMomComparisonSnapshot', () => {
  const now = new Date('2025-06-15T12:00:00.000Z')

  it('Case A — tier 1 prefers snapshot closest to ~30d ago (±10d)', () => {
    const rows = [snap(32, 1_000_000, now), snap(30, 1_010_000, now), snap(1, 1_050_000, now), snap(0, 1_055_000, now)]
    const r = findMomComparisonSnapshot(rows, now)
    expect(r.tier).toBe(1)
    expect(r.snapshot).not.toBeNull()
    expect(Math.round((now.getTime() - new Date(r.snapshot!.date).getTime()) / MS_DAY)).toBe(30)
  })

  it('Case B — tier 1 miss, tier 2 uses most recent snapshot ≥20d old', () => {
    const rows = [snap(45, 980_000, now), snap(1, 1_040_000, now), snap(0, 1_050_000, now)]
    const r = findMomComparisonSnapshot(rows, now)
    expect(r.tier).toBe(2)
    expect(r.snapshot).not.toBeNull()
    expect(r.ageDays).toBe(45)
  })

  it('Case C — only very recent snapshots → no comparison', () => {
    const rows = [snap(1, 1_040_000, now), snap(0, 1_050_000, now)]
    const r = findMomComparisonSnapshot(rows, now)
    expect(r.tier).toBeNull()
    expect(r.snapshot).toBeNull()
  })

  it('Case D — −33d snapshot hits tier 1 (would miss with ±3d legacy window)', () => {
    const rows = [snap(33, 1_000_000, now), snap(1, 1_050_000, now), snap(0, 1_055_000, now)]
    const r = findMomComparisonSnapshot(rows, now)
    expect(r.tier).toBe(1)
    expect(r.snapshot).not.toBeNull()
  })
})

describe('momChangeLabel', () => {
  it('maps tiers to user-facing copy', () => {
    expect(momChangeLabel(1, new Date(), 30)).toBe('MoM')
    expect(momChangeLabel(2, new Date(), 45)).toBe('Change vs 45d ago')
    expect(momChangeLabel(null, null, 0)).toBe('Change unavailable (no snapshots older than 20 days)')
  })
})
