# V6.2.2 Area 2 — Intelligence Fixes

## Status: COMPLETE (code + tests) | curl/plan gates on your machine

## Gap 1 — risk profile source

**Issue:** Strategy inputs used merged settings where `AppSettings.riskProfile` could override **Finances** (`UserProfile.riskProfile`) incorrectly depending on load order and stale copies.

**Fix:** `getMergedSettings` now loads `UserProfile` (`id: 'default'`) and sets  
`riskProfile` via **`mergeRiskProfileLayers(userProfile, appSettings, legacySettings)`** — **UserProfile wins**, then AppSettings, then legacy `Settings`.

**Code:** `src/lib/appSettingsMerge.ts` — `mergeRiskProfileLayers`, `getMergedSettings` (parallel fetch with safe `prisma.userProfile` for partial mocks).

`assembleStrategyInput.ts` still uses `normalizeRiskProfile(merged.riskProfile)`; merged risk now reflects Finances first.

## Gap 2 — misleading short-history CAGR

**Constant:** `MIN_DATA_POINTS_FOR_CAGR = 24` in `src/lib/intelligence/strategyConstants.ts`.

**Assembly:** `assembleStrategyInput.ts` — if `HistoricalNavStats.dataPointCount < 24`, emitted `backtestStats` has `cagrPct5yr: null`, `sharpeRatio: null`, `isTruncated: true`, `dataPointCount` preserved; `maxDrawdownPct` kept when present.

**Proposer:** `strategyProposer.ts` — `determineConfidence` treats partial backtest + library as **MEDIUM**; truncated wording: *"Limited price history (N data points) — CAGR suppressed until 24 months..."*; `keyMetrics` includes `dataPointCount`, `backtestTruncated`.

**Types:** `types.ts` — optional `dataPointCount`, `isTruncated` on `backtestStats`.

## Gap 3 — Vanguard + iShares HY seed

**Script:** `scripts/seedVanguardStats.ts` — upserts:

| ISIN | Note |
|------|------|
| IE00B3XXRP09 | cagr5y 11.9, maxDrawdownAll 23.5, sharpe3y 1.5, recoveryMonths 7, dataPointCount 60 |
| IE00B3F81409 | only if no row: cagr5y 1.8, maxDrawdownAll 12, sharpe3y 0.35, recoveryMonths 18, dataPointCount 60 |

**Run:** `npm run seed:vanguard-stats` (uses `.env` + `tsx`).

Schema fields used: `cagr5y`, `maxDrawdownAll`, `sharpe3y`, `recoveryMonths`, `dataPointCount`, `asOfDate`, `computedAt`.

## Gap 4 — re-propose strategies / plan

**Manual (your DB):**

1. `POST /api/strategies/propose-all`
2. Spot-check `GET /api/strategies` — `drawdownGuardrailPct` 20, `profitCapPct` 35 for **Moderate** (`keyMetrics.riskProfile`).
3. Regenerate month plan; note Corporate Bonds **REBALANCE_DRIFT** row if any.

## Drift tolerance (Corporate Bonds)

**Was:** `DRIFT_THRESHOLD_PP = 10` fixed; sell amount used **full** overage pp × portfolio.

**Now:** `driftThresholdPpForRiskProfile` — Conservative **10pp**, Moderate **15pp**, Aggressive **20pp** (from `merged.riskProfile`).

**Sell size:** Only **(overage − threshold)pp** of total portfolio value is targeted (e.g. 15.8pp over with 15pp tolerance → **0.8pp** not 15.8pp).

**Files:** `rebalanceDrift.ts`, `allocationPlanner.ts`, `holdReasoning.ts` (`driftThresholdPp` on hold targets).

## Tests

- `strategyProposer.test.ts` — Case G (truncated), Case H (30 points, HIGH).
- `riskProfileFix.test.ts` — `mergeRiskProfileLayers` precedence.
- **Vitest:** 188 passed (was 182+ Area 1 baseline; includes new Area 2 tests).

## Gate checklist (local)

| Gate | Notes |
|------|--------|
| A `tsc --noEmit` | PASS |
| B `vitest run` | PASS — 188 tests |
| C riskProfile / guardrails | Verify via propose API after DB has UserProfile Moderate |
| D CAGR suppression | Erste short-history funds → reasoning contains “Limited price history”, not bogus CAGR |
| E Vanguard row | Run `npm run seed:vanguard-stats` + SQL/API check |
| F Corporate Bonds sell | Regenerate plan; expect smaller or no drift sell under Moderate |
| G Tag | `v622-area2-complete` when you tag |

## Rollback

No schema migration. Revert commits or reset to `pre-v622-area2` tag; optionally delete seeded `HistoricalNavStats` rows for the two ISINs.

## Area 3 (do not start here)

Settings UI: show active risk profile source; strategy health; sleeping-money alerts.
