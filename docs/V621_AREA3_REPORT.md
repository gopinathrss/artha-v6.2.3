# V6.2.1 Area 3 — Plan Integration + Cap Monitor Cron

## Status: PARTIAL (code + unit tests; DB smoke gates blocked until Postgres is up)

## allocationPlanner.ts notes (T0.3)

- **Entry function (plan payload):** `buildMonthlyPlanPayload()` (`src/lib/allocationPlanner.ts` around lines 152–412)
- **Plan generator (DB write):** `generateMonthlyPlan()` (`src/lib/allocationPlanner.ts` around lines 414–505)
- **BUY construction site:** `addBuy()` inside `buildMonthlyPlanPayload()` (around line 264)
- **Dual-write:** inside `generateMonthlyPlan()` transaction:
  - `tx.allocationPlan.create` then `replacePlanRows(...)` (around line 433+ / 476)

## What was built

- **Strategy context loader:** `src/lib/intelligence/strategyContext.ts`
  - `loadApprovedStrategies(prisma)` returns a map keyed by `holdingId`
- **Strategy-aware planner augmentation:** `src/lib/allocationPlanner.ts`
  - Loads approved strategies once per payload generation
  - For BUY rows:
    - If approved strategy exists → override `amountCzk = strategy.monthlySipCzk` and append `[Strategy: month N of M, target …]` to reason
    - If strategy cap reached → emits HOLD row with `holdReason='STRATEGY_CAP'` and skips BUY
  - Fallback: if no strategy → existing allocation math remains unchanged
- **This Month UI:** `src/dashboard/scripts/this-month.js`
  - HOLD rows now show a badge when `holdReason` is set, with a **STRATEGY CAP** warning badge
- **Cron jobs (idempotent):**
  - `src/lib/cron/evaluateStrategies.ts` → daily evaluation + alerts
  - `src/lib/cron/monitorProfitCaps.ts` → 6-hour profit-cap proximity alerts
  - Registered in `src/lib/scheduler.ts` with `runCronJob` ledger entries:
    - `evaluate-strategies` (`30 7 * * *`, Prague)
    - `monitor-profit-caps` (`0 */6 * * *`, Prague)
  - Idempotency guard: `writeSignalToDb` skips identical signals fired in last ~20h
- **Health check:** `src/lib/health.ts`
  - Adds `STRATEGY_EVALUATOR` check, increments `HEALTH_CHECK_COUNT`

## Tests added

- `tests/unit/intelligence/strategyContext.test.ts` — verifies map load, cap reached, month count.

## Smoke test (blocked in this environment)

Once Postgres is up and server runs:

1) Approve one strategy, then regenerate plan and verify BUY reason contains `[Strategy:` and amount equals `monthlySipCzk`.
2) Run daily evaluation endpoint and confirm `StrategySignal` rows are written once per day (no duplicates on re-run).

## Note on riskProfile fix request (T1.4)

`assembleStrategyInput.ts` already derives risk profile from **merged AppSettings** (`getMergedSettings(prisma)`), so AppSettings wins when present. If AppSettings row is missing, `ensureAppSettings()` is called by the merge helper and should be created.

