# V6.2.1 Area 4 — Fund Brief UI + Approval Flow

## Status: COMPLETE (code + tests in repo) | Manual gates T6–T7 pending on your machine

## What was built

- **T1 — Reason cleanup:** `buildStrategyReason()` in `src/lib/allocationPlanner.ts` now takes `(strategy, holding)` and returns `{name}: Approved strategy — month N of M, target … Kč` with optional LOW-confidence suffix. Strategy-driven BUYs from `addBuy()` use the same helper (no drift “Hold.” prefix).
- **T2 — Portfolio:** `src/dashboard/scripts/portfolio.js` loads `/api/strategies`, maps by `holdingId`, renders a **strategy card** under each non-`EXITED` holding row (`holding-strategy-row`), approve/reject/re-propose/new proposal via **delegated** `data-strategy-action` buttons and **PieFetch** + **PieUi.toast**. **Run strategy evaluation** button in `portfolio.html` → `POST /api/strategies/evaluate-all`.
- **T3 — This Month:** `this-month.js` loads strategies in parallel, builds `strategyByIsin` for `APPROVED`/`MONITORING`, shows **Month N/M** `badge-strategy` on BUY rows when reason matches `[Strategy:` or `Approved strategy`.
- **T4 — Overview:** `overview.js` fetches `/api/strategies`, renders **Strategies** summary in `#strategy-summary-slot` (inside System health card in `index.html`) with approved/proposed/total and unacknowledged `STRONG_SELL`/`SOFT_SELL` alert + link to `/portfolio`.
- **T5:** Same as T2 evaluate button (portfolio top bar).
- **T6 — Data migration:** Not executed in agent environment (needs running server + cookies). Run the documented `curl` steps locally after deploy.
- **T7 — Browser smoke:** Not run here; checklist below for Gopinath.

## Dashboard patterns observed (P0.2)

- **Layout:** `portfolio.html` / `index.html` use `app-shell`, `topbar`, `content`, `card`, `table.table`.
- **HTTP:** Portfolio uses **`PieFetch`** (`fetchJson.js`) — same-origin cookies, 401 → login. Overview / this-month use raw **`fetch`** (same origin; session cookie applies).
- **Feedback:** **`PieUi.toast(message, 'success'|'error')`** from `pieUi.js`.
- **Badges:** Existing classes `badge-positive`, `badge-negative`, `badge-warning`, `badge-neutral`, `badge-info` (`components.css`).
- **No new JS/CSS frameworks;** styles appended to `src/dashboard/styles/components.css` using design tokens (`--color-*`, `--space-*`, `--radius-*`).

## Gate results (automated)

| Gate | Result |
|------|--------|
| A — `tsc --noEmit` | **PASS** (after fixing `portfolio.ts` `MoneyInput` cast and `externalReadApiGate` test `Response` typing) |
| B — `vitest run` | **PASS** (health expectations updated to **18** checks; strategy proposer test asserts `keyMetrics.riskProfile` for Moderate) |

## Gate results (manual — run locally)

| Gate | Notes |
|------|--------|
| C — BUY reason | Regenerate plan; Top Stocks line should start with **`{name}: Approved strategy —`** not `Hold. Bucket…` |
| D — Strategy cards | `/portfolio`: card per holding; signals from API (last 3) |
| E — Approve flow | Approve → toast + `load()` refresh (no full page reload) |
| F — Overview widget | `/` shows summary counts + signal alert when applicable |
| G — Moderate params | Execute T6 curls + verify `drawdownGuardrailPct` / `keyMetrics` |
| H — Tags | `git tag v621-area4-complete` and `v621-complete` when satisfied |

## Pre-flight / safety (P0, T0)

- **Not run in agent:** `git describe`, `pg_dump`, branch `v621-area4`, tags `pre-v621-area4` / `v621-area3-complete`. Perform on your workstation before relying on rollback.

## Strategy parameters after re-proposal (T6.2–T6.3)

| Holding | drawdownGuardrailPct | profitCapPct | riskProfile |
|---------|---------------------|--------------|-------------|
| *After T6 curls* | Expect **20** for Moderate profile | Expect **35** base (+ CAGR adj) | **Moderate** in `keyMetrics` |

Fill this table after you run `propose-all` and re-approve Top Stocks.

## Browser smoke test checklist (T7)

- **Portfolio:** strategy row under each holding; APPROVED green (`badge-positive`); PROPOSED approve/reject; reasoning `<details>`; evaluate button.
- **Approve:** toast + table refresh.
- **This month:** strategy badge on strategy BUY; reason prefix per Gate C.
- **Overview:** Strategies block above health grid; counts and alert line.
- **Console:** no unexpected errors.

## Visual notes for V6.2.2

- Strategy card uses compact typography; long `proposalReasoning` is scroll-free `pre-wrap` in details — very long text may dominate; optional “max-height + scroll” if needed.
- `signal-row__reason` truncates at 220 chars in portfolio to keep layout stable.

## V6.2.1 complete summary

All four areas delivered in codebase:

1. **Area 1:** FundStrategy schema + strategy proposer  
2. **Area 2:** Four-signal sell decision engine  
3. **Area 3:** Plan integration + cron monitoring  
4. **Area 4:** Fund brief UI + approval flow (this sprint)

---

**Rollback:** `git reset --hard pre-v621-area4` (after you create that tag). No Prisma schema changes in Area 4.
