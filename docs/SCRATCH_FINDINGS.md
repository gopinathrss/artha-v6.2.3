# Scratch findings (Area 2)

## Task 3 — F2.3 (NAV pipeline) — UI + wiring

- **`settings.html` (C — Czech holdings):** Add form fields `a_navSrc` / `a_navSrcId`; table columns for per-row `hold-nav-src`, `hold-nav-id`, `hold-save` → `PUT /api/holdings/:id` with `{ navSourceType, navSourceId }` only.
- **D2 — NRE FD:** Table loads `GET /api/india/rates`; row Save → `PATCH /api/india/nre-fd-rate/:id` with `{ value }` (sets `validFrom` / `validUntil` server-side).
- **Prisma client:** `prisma generate` must succeed locally so `Holding.navSourceType` etc. type-check (agent hit `EPERM` on `query_engine-windows.dll.node` rename).
- **Erste notation IDs (PIE sheet):** Fixture `tests/fixtures/erste-funds.ts`. Live script `scripts/test-erste-live.ts` — **2026-04-30 run: 11/11 valid NAV** (see Area 2 report). Backfill `scripts/backfill-erste-source.ts` (0 rows if no matching `Holding.isin` or already non-null/non-MANUAL source).

## Task 1 — F2.5 / F2.6 (FX staleness)

- **`getFxAgeHours`**: Uses the **stalest** of the three latest CZK↔EUR/USD/INR `FXRate` legs (not only EUR), so health / `getFXRates` / `convertCurrency` agree on one definition of “FX age”.
- **`getRateAge`**: Still returns **minutes** for `/api/currency/rates` (`ageMinutes`); values are min/max across the same three legs.
- **`fetchers.getFXRates`**: `source === 'live'` when `ageHours < FX_STALENESS_WARN_HOURS` (replaces hardcoded 48h).
- **`calculations`**: `calculateHealth` data-quality and `calculateConfidence` FX penalties use `FX_STALENESS_WARN_HOURS` / `FX_STALENESS_FAIL_HOURS`.
