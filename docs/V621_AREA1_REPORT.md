# V6.2.1 Hardening — Area 1 — FundStrategy Model + Strategy Proposer

## Status: PARTIAL (implementation done; DB + migration gates blocked)

## Environment notes

- **Node:** present (v22.x)
- **npm:** not available in this shell environment (Prisma/TSX invoked via `node ./node_modules/...`)
- **Postgres:** **DOWN / not reachable** on `127.0.0.1:5544` (connection refused)
- Because Postgres is unavailable, the following are **blocked** for now:
  - `pg_dump` backups (T0.2)
  - `prisma migrate dev` + `prisma generate` verification (T1.6–T1.7)
  - HistoricalNavStats coverage queries (P0.3)
  - Server health curl (P0.2)

## What was built (code)

- Prisma schema additions:
  - `FundStrategy` model
  - `StrategySignal` model
  - `StrategyStatus`, `StrategyConfidence`, `SignalType`, `SignalStrength` enums
  - Back-relation on `Holding`
- Intelligence foundation:
  - `src/lib/intelligence/types.ts`
  - `src/lib/intelligence/strategyProposer.ts` (pure function)
  - `src/lib/intelligence/assembleStrategyInput.ts` (DB reader + graceful nulls)
  - `src/lib/intelligence/createStrategyProposal.ts` (writer + supersede policy)
- API:
  - `src/api/strategyRoutes.ts` registering `/api/strategies/*`
  - Route registration in `src/api/server.ts`
- Tests:
  - `tests/unit/intelligence/strategyProposer.test.ts`

## How to run the blocked steps locally (once Postgres is up)

Start Postgres (your environment): ensure port **5544** is listening.

Then:

- Backups:

```powershell
Set-Location C:\Projects\artha-v4
C:\Projects\pgsql\bin\pg_dump.exe -U postgres -p 5544 -d artha_v4 -F c -f backups\pre-v621-area1.sql
C:\Projects\pgsql\bin\pg_dump.exe -U postgres -p 5544 -d artha_v4_demo -F c -f backups\pre-v621-area1-demo.sql
```

- Migration + generate (without npm):

```powershell
Set-Location C:\Projects\artha-v4
node .\node_modules\prisma\build\index.js migrate dev --name v621_area1_fund_strategy
node .\node_modules\prisma\build\index.js generate
```

- tsc + unit tests (without npm):

```powershell
Set-Location C:\Projects\artha-v4
node .\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
node .\node_modules\vitest\vitest.mjs run
```

## HistoricalNavStats coverage (P0.3)

**BLOCKED** (Postgres down). When DB is up, run:

```sql
SELECT COUNT(DISTINCT isin) as with_stats FROM "HistoricalNavStats";
```

and

```sql
SELECT l.isin, l.name, CASE WHEN h.isin IS NULL THEN 'NO_STATS' ELSE 'HAS_STATS' END as coverage
FROM "InstrumentLibrary" l
LEFT JOIN "HistoricalNavStats" h ON h.isin = l.isin
ORDER BY coverage, l.name;
```

## Gate results A–H

- **GATE A (tsc)**: BLOCKED here (no `npm`; run `node ./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`)
- **GATE B (vitest)**: BLOCKED here (run `node ./node_modules/vitest/vitest.mjs run`)
- **GATE C (schema via psql \\d)**: BLOCKED (Postgres down)
- **GATE D/E (routes + propose)**: BLOCKED (server fails boot until DB up)
- **GATE F (CZK decimals)**: To verify after running `/api/strategies`
- **GATE G (graceful degradation)**: Implemented by design: missing `HistoricalNavStats` → `confidence=LOW`, no throw (see `assembleStrategyInput`)
- **GATE H (tag/log)**: git tooling not available in this shell environment

## Risks / known issues (deferred)

- `monthlyInvestable` derivation is **approximate** in assembler (see code): in this Area 1 foundation, it uses a conservative fraction of `UserProfile.monthlyNetIncomeCzk` when detailed expense modeling is unavailable.
- Exact DB-backed validation and top-10 George library query are pending until Postgres is running.

