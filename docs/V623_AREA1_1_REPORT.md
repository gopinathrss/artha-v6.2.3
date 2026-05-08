# V6.2.3 Area 1.1 — Page polish + health signals

## Status: IN PROGRESS

## Rules check

- Frontend only: HTML/CSS/JS under `src/dashboard/` (no backend / no TS lib changes).

## Work log

### Feature 0 — Global page health dot

- Added `src/dashboard/scripts/pageHealth.js` exposing `window.PiePageHealth.updatePageHealthDot(...)`.
- Added `.page-health-dot` CSS (3-state + red pulse) to `src/dashboard/styles/components.css`.
- Added `<span id="page-health-dot"></span>` to headers and included `/scripts/pageHealth.js` on:
  - `index.html` (Overview)
  - `portfolio.html`
  - `this-month.html`
  - `tax-calendar.html`
  - `accounts.html`

### Feature 1 — Overview

- Net worth: compact primary + full CZK secondary (CZK display mode).
- FX strip: shows EUR/CZK and INR/CZK (+ inverse) derived from `/api/currency/rates`.
- Health dot wired on success/failure.

### Feature 2 — Portfolio

- Strategy reasoning: collapsed preview with Show more/less toggle.
- Health dot wired using most recent `navLastFetchedAt/updatedAt`; tooltip warns if any NAV is older than 7 days.

### Feature 3 — This Month

- BUY rows: show ISIN under fund name.
- BUY rows: NEW badge when ISIN not in `/api/overview` holdings.
- BUY reason: truncated with Show more/less toggle.
- HOLD rows: show fund name via holdings lookup + ISIN underneath.
- Health dot wired from `plan.generatedAt` (or now).

### Feature 4 — Tax calendar

- Rows show fund name + ISIN + tax-free date + days remaining/ago + value.
- “Already tax-free” includes a soft action hint line.
- Health dot wired on success/failure.

### Feature 5 — Accounts

- Per-account role badges:
  - Sleeping: 💤 Sleeping (tooltip from `capitalEfficiencyNote`) for roles `SLEEPING` / `LONG_TERM_RESERVE`
  - Strategic: `GEO_STRATEGIC`
  - Locked: `LOCKED`
- Interest tiers: renders `interestTiers` as “3% (up to 400k) · 0.01% …” when present, else falls back to `interestRatePct`.
- Grouping headers: Czech / India / Other (by currency).
- Health dot wired using most recent `updatedAt/createdAt`.

### Feature 7 — Dark mode sweep (partial)

- Added global table striping + hover using CSS variables + `color-mix(...)`.

## Gate results

- `tsc --noEmit`: pending (package manager not available in this environment)
- `vitest run`: pending (package manager not available in this environment)

