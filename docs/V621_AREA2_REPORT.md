# V6.2.1 Area 2 — Multi-Factor Sell Decision Engine

## Status: PARTIAL (code + tests implemented; DB smoke gates blocked)

## Environment notes

- **Postgres:** not reachable on `127.0.0.1:5544` in this environment → API/server/migrations cannot be verified here.
- This report captures what was implemented; run the smoke test section once DB + server are up.

## What was built

- **Types:** sell decision types in `src/lib/intelligence/types.ts`
- **Signals:** four pure evaluators under `src/lib/intelligence/signals/`
  - `taxSignal.ts`
  - `allocationSignal.ts`
  - `profitCapSignal.ts`
  - `drawdownSignal.ts`
- **Engine:** `src/lib/intelligence/sellDecisionEngine.ts`
  - `combineSellSignals()` (pure)
  - `evaluateSellDecision()` (DB orchestration)
  - `writeSignalToDb()` (persist fired signals)
  - `evaluateAllApprovedStrategies()` (batch)
- **API:** new endpoints in `src/api/strategyRoutes.ts`
  - `GET /api/strategies/:holdingId/evaluate` (dry run)
  - `POST /api/strategies/evaluate-all` (writes signals)
  - `GET /api/strategies/:holdingId/signals`
  - `PATCH /api/strategies/signals/:signalId/acknowledge`
- **Tests:** unit tests under `tests/unit/intelligence/` for each signal and the combiner.

## Signal test results

| Signal | Cases | Status |
|--------|------:|--------|
| Tax | 5 | Implemented (run vitest) |
| Drawdown | 7 | Implemented (run vitest) |
| ProfitCap | 5 | Implemented (run vitest) |
| Combiner | 5 | Implemented (run vitest) |

## Smoke test (run with real data)

1) Approve a strategy (required; evaluator only runs for APPROVED/MONITORING):

```bash
curl -b cookies.txt http://localhost:3002/api/strategies
curl -b cookies.txt -X PATCH http://localhost:3002/api/strategies/{STRATEGY_ID}/approve \
  -H "Content-Type: application/json" -d "{\"note\":\"smoke test\"}"
```

2) Dry evaluate (no DB writes):

```bash
curl -b cookies.txt http://localhost:3002/api/strategies/{HOLDING_ID}/evaluate
```

3) Evaluate all approved (writes `StrategySignal` rows):

```bash
curl -b cookies.txt -X POST http://localhost:3002/api/strategies/evaluate-all
```

4) Inspect signals:

```sql
SELECT s.\"signalType\", s.strength, s.reasoning
FROM \"StrategySignal\" s
ORDER BY s.\"firedAt\" DESC
LIMIT 10;
```

Paste the full reasoning output here once available.

## Risks / known issues

- Peak-value and drawdown calculation degrade conservatively when historical NAV series is missing (peak=current). This avoids false RISK_SELL on missing data but can under-detect drawdowns.
- Peer average CAGR uses a best-effort approximation based on available rows (and may be null).

## Recommendations for Area 3

Area 3 should call `evaluateAllApprovedStrategies()` on a schedule and handle notifications/alerts. Area 2 intentionally only writes `StrategySignal` rows and returns `SellDecision`.

