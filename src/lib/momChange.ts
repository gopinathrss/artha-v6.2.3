import type { MoneyInput } from './money'

/** Tier 1: compare to snapshot ~30 days ago within this window (days). */
export const MOM_TIER1_TARGET_DAYS = 30
export const MOM_TIER1_TOLERANCE_DAYS = 10
/** Tier 2: use latest snapshot at least this many days old. */
export const MOM_TIER2_MIN_AGE_DAYS = 20

export type MomSnapshotRow = { date: Date; netWorthCzk: MoneyInput }

export type MomComparisonResult =
  | { snapshot: MomSnapshotRow; tier: 1 | 2; ageDays: number }
  | { snapshot: null; tier: null; ageDays: number }

const MS_PER_DAY = 86400000

/**
 * Find a prior snapshot for month-over-month style change: tier 1 window around
 * ~30 days ago, else tier 2 (most recent snapshot at least 20 days old).
 */
export function findMomComparisonSnapshot(
  snapshots: MomSnapshotRow[],
  now: Date = new Date()
): MomComparisonResult {
  const rows = (snapshots || []).filter((s) => s?.date)
  if (rows.length === 0) return { snapshot: null, tier: null, ageDays: 0 }

  const nowT = now.getTime()
  const targetT = nowT - MOM_TIER1_TARGET_DAYS * MS_PER_DAY
  const tol = MOM_TIER1_TOLERANCE_DAYS * MS_PER_DAY

  let best: { s: MomSnapshotRow; dist: number } | null = null
  for (const s of rows) {
    const t = new Date(s.date).getTime()
    const dist = Math.abs(t - targetT)
    if (dist <= tol && (!best || dist < best.dist)) {
      best = { s, dist }
    }
  }
  if (best) {
    const ageDays = Math.round((nowT - new Date(best.s.date).getTime()) / MS_PER_DAY)
    return { snapshot: best.s, tier: 1, ageDays }
  }

  const tier2Candidates = rows
    .map((s) => ({ s, t: new Date(s.date).getTime() }))
    .filter(({ t }) => nowT - t >= MOM_TIER2_MIN_AGE_DAYS * MS_PER_DAY)
    .sort((a, b) => b.t - a.t)
  const pick = tier2Candidates[0]
  if (pick) {
    const ageDays = Math.round((nowT - pick.t) / MS_PER_DAY)
    return { snapshot: pick.s, tier: 2, ageDays }
  }

  return { snapshot: null, tier: null, ageDays: 0 }
}

export function momChangeLabel(tier: 1 | 2 | null, _snapshotDate: Date | null, ageDays: number): string {
  if (tier === 1) return 'MoM'
  if (tier === 2) return `Change vs ${ageDays}d ago`
  return 'Change unavailable (no snapshots older than 20 days)'
}
