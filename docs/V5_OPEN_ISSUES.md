# V5 open issues (non-blocking for v5.0)

Tracked for a **V5.1** patch. No critical runtime breakage for core portfolio flows.

## Historical NAV / Yahoo

| Item | Notes |
|------|--------|
| **AT0000A10QN3** | Austrian government bond ISIN in scope of bulk import; **no Yahoo listing** in `isinToYahooTicker`. Erste path does not apply (non-CZ prefix). Historical tier-2 NAV not available from Yahoo. |
| **LU0908500753** (Amundi S&P 500 ESG) | Seed ticker `500ESG.PA` returns no Yahoo chart data. Import uses **`C5E.PA`** as a liquid proxy; NAV levels may diverge slightly from the exact fund. Confirm or replace with a better symbol in V5.1. |
| **IE00B8X9K012** (iShares Core MSCI World USD Hedged) | `IWDH.*` Yahoo symbols 404. Import uses **`IWQU.L`** (USD-hedged MSCI World UCITS) as a **proxy** for historical series. |

## Tooling / Windows

| Item | Notes |
|------|--------|
| **`pg_dump` schema diff** | `pg_dump -s` files differ only on generated `\\restrict` / `\\unrestrict` tokens between dumps; **compare sorted `_prisma_migrations.migration_name` lists** for applied-set parity (identical as of Sprint 6). |

## Demo / smoke

| Item | Notes |
|------|--------|
| **`scripts/full-smoke.ts`** | Expects **`demoModeEnabled === false`** in real `Settings` so `/api/holdings` and `/api/overview` hit the real portfolio (≥11 holdings). Turn demo off in Settings before CI-style smoke, or extend the script to accept demo in V5.1. |
