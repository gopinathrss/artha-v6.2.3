# ARTHA V5 — audit (post Sprint 6)

Generated: 2026-05-02. Codebase: `c:\Projects\artha-v4`, branch `master`.

## 1. Executive summary

**V5 vs V4 (high level)**  
V5 adds a **real-data path** (Excel, Erste-style holdings, cashflows, optional IMAP ingestion), a **unified V5 dashboard** (tokens + shell + 14 HTML routes), a **wisdom layer** (backtest on tier-2 historical NAVs, outcome evaluation, YAML pattern library + AI citations), **tiered historical storage** with bulk Yahoo/Erste import and stats, and **smart reports** (templates, HTML, cron + optional email/Telegram). V4’s monolithic `artha-ui.css` / `artha-ui.js` bundle is gone.

**Sprints**  
Six sprints (S1–S6): real data → UI shell → intelligence → library/backtest → historical + reports + patterns content → final verification and **v5.0** tag.

**Size (approximate, machine-measured where noted)**

| Metric | Value |
|--------|--------|
| Git commits (total, `rev-list --count HEAD`) | 57 |
| `src/**/*.ts|html|js` files | 97 |
| Prisma models (`^model ` in `schema.prisma`) | 33 |
| Express route registrations (`app.(get|post|put|delete|patch)(` in `src/api/*.ts`) | 109 |
| Design tokens (`^  --` lines in `src/dashboard/styles/tokens.css`) | 97 |
| Playwright visual tests (`tests/visual/all-pages.spec.ts`) | 56 |
| Vitest (default run, 2026-05-02) | 80 passed, 25 skipped |
| Prisma migrations applied (`_prisma_migrations` count) | 17 |

## 2. Architecture

**Historical storage (3 tiers)**  
1. **`NavHistory`** — per-fund daily NAV where populated (cron / Erste).  
2. **`HistoricalNavSummary`** — up to ~10y of Yahoo/Erste points: daily inside ~3y, monthly outside; used by backtest + stats.  
3. **`BacktestLesson`** — compact post-plan text tied to stats + pattern ids (`prisma` schema comments).

**Lesson flow**  
`generateMonthlyPlan` → `lessonExtractor` reads `HistoricalNavStats` / patterns → persists `BacktestLesson`; APIs `/api/lessons/recent`, `/api/lessons/by-isin/:isin`; backtest UI shows “Fund lesson”.

**Pattern library**  
`data/patterns/v1.yaml` loaded at runtime; allocation / AI paths cite pattern ids. `/api/patterns` serves list (60 entries).

**Demo isolation**  
`DATABASE_URL` (real) vs `DATABASE_URL_DEMO` (required). `getPrisma()` switches on `Settings.demoModeEnabled`; demo seed via `wipeAndSeedDemoDb`.

**Cron schedule** (`src/lib/scheduler.ts`, `node-cron`)

| Schedule | TZ | Job / purpose |
|----------|-----|----------------|
| `30 16 * * 1-5` | Europe/Prague | FX refresh (weekdays) |
| `0 6 * * 1-5` | Europe/Prague | Morning job (FX, prices, triggers) |
| `0 6 1 * *` | Europe/Prague | Monthly letter (if enabled) |
| `0 2 * * 0` | Europe/Prague | Weekly backup |
| `0 9 1 * *` | Europe/Prague | EOM journal reminder |
| `0 6 * * *` | Europe/Prague | Salary-day auto plan |
| `0 8 * * *` | Europe/Prague | Daily digest (Telegram/email) |
| `30 14 * * *` | Asia/Kolkata | AMFI NAVAll ingest |
| `0 17 * * 1-5` | Europe/Prague | Czech NAV refresh |
| `0 2 1 * *` | Europe/Prague | Library scores refresh |
| `0 2 * * *` | Europe/Prague | Outcome evaluation |
| `0 9-21 * * *` | Europe/Prague | Email ingestion (hourly window) |
| `0 3 1 1,4,7,10 *` | Europe/Prague | Historical NAV bulk import (quarterly) |
| `20 6 1 * *` | Europe/Prague | Smart monthly report + delivery |
| `30 6 1 1,4,7,10 *` | Europe/Prague | Smart quarterly report + delivery |
| `0 7 1 4 *` | Europe/Prague | Smart tax-year report + delivery |

## 3. Data layer (headline counts)

**Real DB `artha_v4`** (psql 2026-05-02):

| Table | Rows |
|-------|------|
| Holding | 11 |
| InstrumentLibrary | 30 |
| HistoricalNavSummary | 24,964 |
| HistoricalNavStats | 39 |
| NavHistory | 0 |
| RecommendationOutcome | 10 |
| GeneratedReport | 6 |
| _prisma_migrations | 17 |

**Demo DB `artha_v4_demo`** (same query):

| Table | Rows |
|-------|------|
| Holding | 6 |
| InstrumentLibrary | 30 |
| HistoricalNavSummary / HistoricalNavStats / outcomes / reports | 0 (seed/demo) |
| _prisma_migrations | 17 |

**Migration parity**  
Sorted `migration_name` lists: **identical** between real and demo after `prisma migrate deploy` on demo. `pg_dump -s` file `fc` shows only spurious `\\restrict` token differences, not DDL drift.

## 4. Coverage matrix

**Pages (V5 HTML under `src/dashboard`)** — 14 routes in `server.ts` `PAGES`: `/`, `/onboarding`, `/this-month`, `/finances`, `/india`, `/portfolio`, `/tax-calendar`, `/alerts`, `/reports`, `/settings`, `/intelligence`, `/library`, `/backtest`, `/patterns`. All wired to V5 shell/tokens.

**Playwright** — `all-pages.spec.ts`: 14 routes × 4 variants (desktop 1400 light/dark, mobile 375 light/dark) = **56** passing (2026-05-02, `PW_REUSE_SERVER=1` with dev server on 3002).

**API smoke** — `scripts/full-smoke.ts`: **14** checks (health, health checks, overview, this-month, holdings, India MF, alerts, library, patterns, cron recent, outcomes summary, backtest CAGR, smart report HTML, demo flag).

**Unit / integration** — Vitest: **80** passed (same date); live-DB tests skipped unless `ARTHA_TEST_DB_LIVE=1`.

## 5. Known gaps (not bugs)

- Indian MF holdings: **user data entry**; AMFI cron ingests industry file, not personal CAS parse beyond upload storage.  
- **CAS PDF**: upload stored; full parse deferred.  
- **Yahoo mapping**: a few ISINs use proxies or lack Yahoo entirely — see `docs/V5_OPEN_ISSUES.md`.  
- **Patterns**: 60 curated defaults; user may add overrides over time.  
- **Backtest**: monthly resolution beyond ~3y daily window (by design / Option Z in sprint docs).

## 6. Operational readiness

- **Git tags**: `pre-v5-s1` … `pre-v5-s6` (incremental), `v5-s1-complete` … `v5-s6-complete`, **`v5.0`** (release).  
- **Health**: `HEALTH_CHECK_COUNT = 16` named checks in `src/lib/health.ts`; `/api/health` used for trust score.  
- **Crons**: listed above; startup logs confirm registration in `startScheduler()`.  
- **Email / Telegram**: code paths exist; production verification depends on `.env` (see checklist).  
- **Backups**: weekly job + user `pg_dump` workflow (Portable `pg_dump` may be off-PATH on some Windows installs — document in ops).

## 7. Verification evidence (Sprint 6 gates)

| Gate | Result |
|------|--------|
| A `tsc -p tsconfig.build.json` | Exit 0 |
| B Vitest | 80 passed |
| C Playwright `all-pages.spec.ts` | 56 passed |
| D `scripts/full-smoke.ts` | 14 passed, 0 failed |
| E `COUNT(DISTINCT isin) FROM HistoricalNavStats` | 39 (> 25) |
| F Schema / migrations | DDL noise only; migration names match (sorted) |
| G Docs | `V5_AUDIT`, `V5_PRODUCTION_CHECKLIST`, `V5_RELEASE_NOTES`, `V5_OPEN_ISSUES` |
| H Tag `v5.0` | On release commit |

*(Exact command transcripts belong in the sprint report / CI logs; this file is the consolidated factual snapshot.)*
