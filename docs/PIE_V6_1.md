# PIE v6.1 — System reference

**Product name:** PIE — Personal Investment Engine  
**Repository / package:** `artha-v4` (npm `displayName` and `description` use PIE; the folder name is historical.)  
**Stack:** Node.js, Express 5, TypeScript, Prisma 6, PostgreSQL, static HTML/JS dashboard, ECharts.

---

## 1. What “v6.1” means here

The repo’s `package.json` version is **`1.0.0`**; there is no separate git tag named `v6.1` in code. In this document, **PIE v6.1** is a **product-generation label**:

- **V4** — personal CFO foundation (allocation plans, profile, cashflow semantics, India lane seeds).
- **V5.x** — dashboard expansion, AppSettings, integrations registry, richer reporting and patterns.
- **V6** — consolidated architecture and hardening (dashboard auth gates, demo database isolation, `/api/health` trust model, external read API gate). See `docs/V6_DEEP_AUDIT.md` for a formal audit snapshot (2026-05-03).
- **v6.1** — same codebase generation, described as a **minor documentation and operator-experience slice**: behavior and UI are the “current” system you run from this tree (including small fixes like health re-check feedback and clearer health messaging).

So: **v6.1 = “V6-era PIE, as-operated today,”** not a separate installable artifact.

---

## 2. Design intent (logic at the highest level)

PIE is a **single-user (or single-household) wealth cockpit**:

1. **Truth in Postgres** — holdings, accounts, cashflows, plans, snapshots, and integration state live in PostgreSQL with Prisma. Money fields use **`Decimal`** in the schema to avoid float drift on the server.
2. **One mental model** — Czech mutual funds / ETFs (George/Erste-style), optional **India** MF + FD ladders, FX via a **CZK hub**, and a monthly **allocation plan** that turns income and commitments into BUY / SELL / HOLD / RESERVE rows.
3. **Safety rails** — **Demo mode** must use a **second database** (`DATABASE_URL_DEMO` ≠ `DATABASE_URL`) so demo never writes the real portfolio.
4. **Automation without black boxes** — scheduled jobs refresh FX, run morning price/trigger passes, optionally generate plans and letters; **health checks** and **cron ledger** exist so an operator can see freshness and job success.
5. **Optional intelligence** — AI providers are **integrations** (OpenAI, Anthropic, Gemini); answers and report briefs are additive, not the source of balances.

---

## 3. Runtime architecture

### 3.1 Process model

- **Entry:** `src/api/server.ts` (dev: `tsx src/api/server.ts` with `.env`).
- **HTTP:** Express `app` with `trust proxy: 1` for reverse proxies (Caddy/NGINX).
- **JSON:** `express.json({ limit: '10mb' })`; responses pass through **`serializeJsonBody`** (Decimal-aware JSON shaping — see audit notes on number precision for extreme magnitudes).
- **Static UI:** `express.static` serves `src/dashboard` (HTML, JS, CSS). Chart assets under `/charts` and ECharts vendor under `/vendor/echarts`.
- **Scheduler:** `startScheduler()` from `src/lib/scheduler.ts` registers `node-cron` tasks (Prague timezone). Jobs wrap **`runCronJob`** (`src/lib/cronWrapper.ts`) for **`CronExecution`** ledger rows.

### 3.2 Routing layout

| Area | Registration |
|------|----------------|
| CFO / plans / India / reports / alerts / historical / backtest / patterns | `registerCfoRoutes` — `src/api/cfoRoutes.ts` |
| App preferences (theme, display currency, dashboard auth flags, …) | `registerAppSettingsRoutes` — `src/api/appSettingsRoutes.ts` |
| Integration providers (AI, SMTP, Telegram, IMAP, FX API) | `registerIntegrationsRoutes` — `src/api/integrationsRoutes.ts` |
| Gmail OAuth (mail) | `registerGoogleMailOAuthRoutes` — `src/api/googleMailOAuthRoutes.ts` |
| Login, session, password reset | `registerDashboardAuthRoutes` — `src/api/dashboardAuthRoutes.ts` |
| Dashboard HTML gate + `/api/*` session gate | `registerDashboardHtmlAuthGate`, `registerDashboardApiAuthGate` — `src/api/dashboardAuthMiddleware.ts` |
| Optional external read-only API gate | `registerExternalReadApiGate` — `src/api/externalReadApiGate.ts` |
| Legacy settings blob, backup export/import, portfolio reset, many intelligence endpoints | Inline in `src/api/server.ts` |

**HTML pages** are mapped in `server.ts` (`PAGES` / `PAGE_FILES`): `/`, `/onboarding`, `/this-month`, `/finances`, `/india`, `/portfolio`, `/accounts`, `/tax-calendar`, `/alerts`, `/reports`, `/settings`, `/intelligence`, `/library`, `/backtest`, `/patterns`, `/help`. **`/profile` redirects to `/settings`**.

**Probes:** `GET /healthz` — DB ping + optional strict AI check via env; **`GET /api/health`** — full **`runHealthChecks()`** (`src/lib/health.ts`) with trust score.

---

## 4. Data layer and “which database”

### 4.1 Dual URLs (mandatory)

`src/lib/prismaProvider.ts`:

- **`DATABASE_URL`** → **`realPrisma`** (real portfolio).
- **`DATABASE_URL_DEMO`** → **`demoPrisma`** (demo only).
- If URLs are equal, the process **throws** (anti-footgun).
- **`getPrisma()`** resolves to demo or real from **`Settings.demoModeEnabled`** / merged AppSettings (cached ~5s).

All user-facing portfolio reads/writes should go through **`getPrisma()`** except where code intentionally uses **`realPrisma`** (e.g. health, demo flag read, some auth paths).

### 4.2 Schema domains (Prisma)

Rough grouping of `prisma/schema.prisma`:

| Domain | Models (representative) |
|--------|-------------------------|
| Core portfolio | `Holding`, `Cashflow`, `Account`, `Instrument`, `PriceHistory` |
| Snapshots & alerts | `Snapshot`, `AlertLog` |
| Legacy + V5.2 settings | `Settings`, **`AppSettings`** |
| Integrations | `IntegrationProvider`, `IntegrationStatus` |
| Email ingestion UI | `EmailIngestionPreview` |
| Library | `InstrumentLibrary` |
| AI memory | `AIMemory` |
| India reference rates | `IndiaIntelligence` |
| Personal CFO | `UserProfile`, `IncomeEvent`, `ExpenseCommitment`, `UpcomingEvent` |
| Plans | `AllocationPlan` (JSON `allocations` + `continuity`), **`AllocationPlanRow`** (typed BUY/SELL/HOLD/RESERVE), `SipExecution` |
| Outcomes | `RecommendationOutcome` |
| Market data | `FXRate`, `NavHistory`, `HistoricalNavSummary`, `HistoricalNavStats`, `HistoricalReturn` |
| Learning / backtest | `BacktestLesson`, `BacktestRun` |
| Reports | `MonthlyLetter`, `GeneratedReport` |
| Ops | `SystemHealth`, `CronExecution`, `AdvisorJournal` |
| India holdings | `IndiaMutualFund`, `IndiaFixedDeposit` |

**Logic:** `AllocationPlan.allocations` remains JSON validated in application code (`allocationPlanSchema`, guards); **`AllocationPlanRow`** is the normalized execution-oriented projection for adherence and edits.

---

## 5. Core business logic chains

### 5.1 Portfolio summary (`src/lib/portfolio.ts` + `src/lib/calculations.ts`)

1. Load active holdings (with cashflows), accounts, snapshots, India MFs, merged settings.
2. Load FX (CZK hub: EURCZK, EURINR, etc.) via **`getFXRates()`**.
3. **`netCashInvestedCzkFromCashflows`** — SIP/LUMP_SUM add principal, WITHDRAWAL subtracts, DIVIDEND ignored for this principal-style total; **dedupes** by (holdingId, day, type, rounded amount).
4. **XIRR** from dated cashflows vs current total value.
5. **`calculateNetWorth`** — combines holdings, accounts (via FX), India pieces.
6. **`calculateAllocation`** — equity / bonds / cash vs targets; India slices feed allocation.
7. **Price age + FX age → `calculateConfidence`**; health and MoM labels use **`Snapshot`** density.

**Why:** One server-side summary drives overview, intelligence, and many reports so the UI does not reimplement finance math.

### 5.2 Allocation planner (`src/lib/allocationPlanner.ts`)

**Inputs:** profile (salary day, SIP day, income), income events, expense commitments, upcoming events, holdings, accounts, India funds, instrument library scores, FX, merged targets, tax-free settings.

**Flow (simplified):**

1. Compute **monthly investable cash** after fixed expenses and reserved events (`monthlyIncomeCzk`, commitments, etc.).
2. **`calculateAllocation`** for current drift vs policy.
3. **Sell-side detectors** (modular):
   - **`detectTaxFreeExitOpportunities`** — `sellEngine/taxFreeExit`
   - **`detectRebalanceSells`** — `sellEngine/rebalanceDrift`
   - **`detectFdMaturityActions`** — `sellEngine/fdMaturity`
4. **Buy-side** — library scoring, gaps, continuity meta (`computeContinuityMeta`, `continuityBuyReason`).
5. **Hold rows** — `sellEngine/holdReasoning` for narrative holds.
6. Persist plan + **`replacePlanRows`** for typed rows; strict JSON parsing for legacy `allocations`.

**Tax-free window:** `taxFreeWindowAllowsBuy` (merged settings) controls whether reduced BUY is emitted near Czech tax-free anniversary (planner semantics documented in schema comments).

### 5.3 Triggers and snapshots (`src/lib/triggers.ts`)

- **`runAllTriggers`** — e.g. tax-free approaching, allocation drift → **`fireAlertWithDedup`** (`alerts/dedup`).
- **`saveDailySnapshotFromPortfolio`** — upserts **today’s** `Snapshot` (net worth, allocation mix, gain, XIRR, health/confidence scores).

Morning job path composes FX refresh, NAV refresh, snapshot, alerts (see `runMorningJob` in triggers).

### 5.4 India lane (`src/lib/indiaIntelligence.ts`, India routes)

- **User data:** `IndiaMutualFund`, `IndiaFixedDeposit` CRUD + NAV refresh (AMFI ingest paths).
- **Reference data:** `IndiaIntelligence` (e.g. NRE FD rates, RBI context) with **`validFrom` / `validUntil`** — health uses **stalest NRE FD age** (warn ≥30d, fail >60d in messaging).
- **API helpers** (also used from server): DTA comparison, FCNR vs NRE, NRI-eligible MF list, **`getRbiRepoRate`**, etc.

### 5.5 FX and NAV

- **FX:** `src/lib/currency.ts` / fetchers; scheduler weekday refresh; **`FXRate`** storage; health uses **`getFxAgeHours`** with warn/fail hour thresholds.
- **NAV:** Erste, Yahoo, AMFI modules under `src/lib/nav/`; `NavHistory` + optional **`HistoricalNavSummary`** for long history; **`refreshAll`** style jobs from triggers/scheduler.

### 5.6 Ingestion (`src/lib/ingestion/`)

- **Orchestrator** coordinates parsers (e.g. **Erste** email, **CAS** PDF).
- **IMAP** (`imapflow`, `mailparser`) ties to **`EmailIngestionPreview`** and approval flows.
- Excel/banking import routes live under **`src/api/excelImportRoutes.ts`** (and related lib).

### 5.7 Reports (`src/lib/reports/`)

- **`buildReportData`** assembles monthly/quarterly/tax-year numbers and narratives.
- **Templates** (`templates/monthly.ts`, etc.) + **`reportShell`** / **`generator`**.
- **Delivery** (`delivery.ts`) and optional **AI brief** (`aiBrief.ts`).
- **GeneratedReport** stores tokenized HTML for “view” URLs.

### 5.8 AI (`src/lib/aiIntelligence.ts`, `src/lib/integrations/ai/`)

- **Router** picks provider; **single active AI** policy in `singleActiveAi.ts` aligns with AppSettings default key.
- **AIMemory** stores Q&A and portfolio snapshots for continuity.
- Rate limit / cache patterns exist on **`/api/ask`** style endpoints in `server.ts` (client key from `req.ip`).

### 5.9 Backups and retention

- **Backup:** `src/lib/backup.ts`; export/import via **`/api/settings/backup/export`** and **`import`** (server.ts).
- **Retention:** `src/lib/cron/pruneOldRows.ts` + knobs on Settings/AppSettings (`cronExecutionRetentionDays`, `systemHealthRetentionDays`, `emailPreviewRetentionDays`, `alertLogDismissedRetentionDays`); scheduler runs prune jobs.

### 5.10 Dashboard authentication (`src/lib/dashboardAuth.ts`, routes + middleware)

- Optional **password gate** when `dashboardAuthEnabled` is on (AppSettings).
- Session cookie parsing for HTML navigation vs JSON **401** on `/api/*`.
- Bootstrap phrase / password hashing on AppSettings; env fallback possible for bootstrap key (see schema comments).

### 5.11 Settings merge (`src/lib/appSettingsMerge.ts`)

- **`ensureAppSettings`** creates default AppSettings from legacy Settings once.
- **`getMergedSettings`** — **AppSettings wins** for allocation targets, toggles, theme, display currency, retention knobs, onboarding flag, etc.

---

## 6. Integrations plane

**Registry:** `src/lib/integrations/registry.ts`

| Key | Category | Role |
|-----|----------|------|
| `ai.openai` | ai | Chat/completions |
| `ai.anthropic` | ai | Claude |
| `ai.gemini` | ai | Gemini |
| `comms.smtp` | communications | Outbound mail |
| `comms.telegram` | communications | Bot notifications |
| `comms.imap` | communications | Inbound mail / ingestion |
| `fx.exchangerate-api` | financial | FX pulls |

**Logic:** Each row has **`config`** (JSON) and **`secrets`** (JSON, encrypted at rest via secrets helper — see `src/lib/secrets.ts`). **Test runner** (`integrations/testRunner.ts`) powers Settings “Test connection” actions. Env fallbacks for some AI keys exist for dev (`env-fallback.ts`).

---

## 7. System health (17 checks)

**Constant:** `HEALTH_CHECK_COUNT = 17` in `src/lib/health.ts`.

**Checks (names as stored):**  
`DB_HEALTH`, `FX_FRESHNESS`, `NAV_FRESHNESS`, `EMAIL_CONFIGURED`, `AI_REACHABLE`, `PROFILE_COMPLETE`, `RBI_RATE_FRESHNESS`, `NRE_FD_RATE_FRESHNESS`, `LIBRARY`, `SNAPSHOT_FRESHNESS`, `PLAN_COVERAGE`, `ADHERENCE_KNOWN`, `BACKUP_RECENT`, `AI_RECENT_FAILURES`, `CRON_HEALTH`, `MEMORY_HEALTHY`, `RETENTION_POLICY`.

**Trust score:** Derived from pass/warn/fail weighting over the expected count (see implementation in `health.ts`).

**DB down behavior:** **`healthChecksWhenDbDown`** returns **FAIL** on DB and **WARN** stubs for others so JSON still returns — operators must read **`DB_HEALTH`** (see audit F14.1).

---

## 8. Scheduler (conceptual schedule)

From `src/lib/scheduler.ts` (Europe/Prague):

- **Weekday 16:30** — FX refresh (`fetchAllRates`).
- **Weekday 06:00** — Morning job (`runMorningJob` — FX/prices/triggers/snapshot path).
- **1st of month 06:00** — Monthly letter (if enabled and portfolio OK).
- **Sunday 02:00** — Weekly backup (`runWeeklyBackup`).
- **1st 09:00** — Month-end advisor journal nudge.
- **Daily 06:00** — Salary-day auto-plan branch (profile-dependent).
- Additional jobs: NAV refresh cadence, prune, library scores, outcome evaluation, etc. (read file for full list).

**Logic:** Every job should be observable via **`CronExecution`** and **`/api/cron/recent`**.

---

## 9. Dashboard pages (user surface)

| Route | Typical role |
|-------|----------------|
| `/` | Overview / hero stats |
| `/onboarding` | First-run wizard |
| `/this-month` | Current plan, adherence, edits |
| `/finances` | Income, expenses, cashflow picture |
| `/india` | India MF + FD + intelligence |
| `/portfolio` | Holdings detail |
| `/accounts` | Cash / bank-style accounts |
| `/tax-calendar` | Tax-related dates |
| `/alerts` | Alert inbox |
| `/reports` | Report list / generate |
| `/settings` | App prefs, integrations, health, backup, reset |
| `/intelligence` | Ask PIE / AI console |
| `/library` | Instrument library |
| `/backtest` | Backtest runs |
| `/patterns` | Pattern search |
| `/help` | Documentation links |
| `/login.html` (and related) | Auth when enabled |

Shell: **`sidebar.js`**, **`shell.js`**, theme **`theme.js`**, per-page **`scripts/*.js`**.

---

## 10. Testing and tooling

- **Unit/integration:** Vitest (`npm test`).
- **Browser:** Playwright (`test:visual`, `test:e2e`).
- **Stress:** `tests/stress` scripts.
- **DB:** Prisma migrate; scripts under `scripts/` (e.g. `migrate-settings-to-v52`, demo isolation doc referenced in prisma provider error text).

---

## 11. How to read this vs the audit

- **`docs/V6_DEEP_AUDIT.md`** — structured findings, severities, and verification gaps for a fix sprint.
- **`docs/PIE_V6_1.md` (this file)** — descriptive architecture and behavior as implemented in the tree: **what exists and why**, not a pass/fail checklist.

If a behavior changes in code, **this document should be updated** when you intentionally ship a new “generation” label (e.g. v6.2).

---

*Generated as a codebase-derived reference. Align with `package.json` `displayName` / `description` and `src/api/server.ts` for authoritative naming.*
