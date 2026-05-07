# V6.2.2 Area 1 — Capital Efficiency Model

## Status: COMPLETE (code in repo) | DB migrate + curl gates on your machine

## What was built

- **Schema:** `AccountRole` enum, `Account.accountRole`, `interestTiers` (JSON), `emergencyFundTarget`, `fxTrendNote`, `capitalEfficiencyNote`; **`MacroData`** (`key`, `valueDecimal`) for `CZ_INFLATION_PCT`.
- **Migration** `20260507140000_v622_area1_account_capital_efficiency`: role seeding (INR NRE/NRO → `GEO_STRATEGIC`, `FIXED_DEPOSIT`/PENSION → `LOCKED`, CZK `SAVINGS` → `LONG_TERM_RESERVE`).
- **`interestTiers.ts`:** `computeAnnualInterest`, `effectiveRatePct`, `marginalRatePct`, `optimalCapCzk`, `computeSleepingAmount`, `parseInterestTiersJson`.
- **`sleepingMoneyEngine.ts`:** `getInflationRate`, `computeCapitalEfficiency` → `SleepingMoneyReport`; geo reserve skips sleeping when tiers absent; optional `Account` → `SLEEPING` when sleeping &gt; 10k (non–geo, non–locked, non–emergency).
- **API:** `GET /api/capital-efficiency`, `PATCH /api/accounts/:id/interest-tiers`, `PATCH /api/accounts/:id/role` (`registerCapitalEfficiencyRoutes` in `server.ts`).
- **Allocation:** `accountContributesToDeployableAllocationSlice` + filtered `indiaAccountSlicesFromAccounts`; planner emergency liquidity uses same filter (only `INVESTABLE` / `SLEEPING` NRE/SAVINGS).
- **Alerts:** `maybeFireSleepingMoneyAlert` (7-day suppression) from **morning job** (`triggers.ts`).
- **Health:** `CAPITAL_EFFICIENCY` row (sleeping accounts); `HEALTH_CHECK_COUNT` = **19**; DB-down stub list includes `CAPITAL_EFFICIENCY`.
- **Tests:** `interestTiers.test.ts`, `sleepingMoney.test.ts`; `calculations.test.ts` updated so `indiaAccountSlicesFromAccounts` expects **no bonds** from INR `FIXED_DEPOSIT` (locked / non-deployable slice).

## P0 assumptions (agent environment)

- **`prisma generate`** may hit Windows `EPERM` on `query_engine`; re-run locally after closing locks.
- **`MacroData`:** table created by migration; no CPI row seeded — inflation falls back to **2.5%** until `CZ_INFLATION_PCT` is inserted.
- **Account `type`:** schema uses `FIXED_DEPOSIT` (not `FD`); migration matches that.

## Capital efficiency (T7.4) — fill after curl

- `totalSleepingCzk`: _
- `totalAnnualRealLossCzk`: _
- `alertLevel`: _
- `summary`: _
- `deployableIdeas`: _

## Allocation before vs after

| Metric | Before | After (expected) |
|--------|--------|-------------------|
| India cash in allocation slice | NRE + NRO + INR savings (all roles) | Only `INVESTABLE` / `SLEEPING` INR cash-like |
| Cash-heavy rebalance sells | e.g. Sporoinvest drift sell | Reduced or gone when geo/long-term excluded |

## Gate checklist A–H

| Gate | Notes |
|------|--------|
| A `tsc --noEmit` | **PASS** in agent run (`node_modules/.bin/tsc --noEmit`) after prior fixes |
| B `vitest run` | **PASS** — 182 passed (includes `interestTiers`, `sleepingMoney`, updated `calculations` deployable-slice test) |
| C Schema | Apply migration |
| D Auto roles | Verify with `SELECT ... "accountRole"` |
| E API | `GET /api/capital-efficiency` |
| F Plan | Regenerate month plan; document new `cashPct` |
| G Health | `/api/health` includes `CAPITAL_EFFICIENCY` |
| H Tags | `v622-area1-complete` (local) |

## Rollback

`git reset --hard pre-v622-area1` and restore DB from `backups/pre-v622-area1.sql` if needed.

## Area 2 (do not start here)

Intelligence fixes (riskProfile, CAGR, Vanguard HIGH confidence) — separate sprint.
