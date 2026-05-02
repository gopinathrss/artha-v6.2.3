# ARTHA V5.0 — Release Notes

## What's new since V4.1-hardened

### Real data

- Excel import for initial portfolio load (Banking_Input.xlsx format)
- 11 Czech holdings loaded with status preserved
- 6 months of historical cashflows imported
- IMAP email ingestion for Erste SIP confirmations (toggle in Settings)
- CAS PDF upload endpoint for Indian MFs

### Premium UI (Linear/Notion direction)

- Complete design system: **97** design tokens in `src/dashboard/styles/tokens.css`
- **14** dashboard routes rebuilt against V5 design (overview, onboarding, and 12 feature surfaces)
- System-following theme with manual override
- Mobile responsive at 375px+
- **56** Playwright visual tests covering all pages (4 viewports/themes per page)

### Wisdom Layer

- Backtest Lab: replay strategies against historical NAV data
- Outcome Tracker: 30/90 day evaluation of past recommendations
- Pattern Library: **60** curated finance principles (YAML)
- AI integration: recommendations cite relevant patterns

### Historical Foundation

- 3-tier storage: NavHistory (daily / your funds) + HistoricalNavSummary (~3y daily + ~7y monthly) + BacktestLesson (insights)
- Bulk import from Yahoo Finance + Erste GraphQL (`scripts/import-historical-navs.ts`)
- Quarterly auto-refresh via cron
- **~25k** HistoricalNavSummary rows and **39** distinct `HistoricalNavStats` ISINs after Sprint 6 Yahoo mapping fixes (environment-dependent)

### Smart Reports

- Three templates: Monthly / Quarterly / Tax-year
- Cron-scheduled auto-generation
- Email + Telegram delivery channels
- AI-generated executive summaries

### Numbers (indicative)

- Migrations: **17** applied on real and demo DB (`_prisma_migrations` count, 2026-05-02)
- `src` tree: **97** `.ts`/`.html`/`.js` files (excludes `node_modules`)
- Tests: Vitest **80** passed (25 skipped without live DB); Playwright **56** passed
- Express route registrations in `src/api`: **109**
- Scheduled jobs: **14** `cron.schedule` entries in `src/lib/scheduler.ts` (see `docs/V5_AUDIT.md`)

## Breaking changes from V4

- Settings / startup: **`DATABASE_URL_DEMO` required** (fail-loud demo isolation)
- `artha-ui.css` and `artha-ui.js` deleted (V4 legacy bundle)
- Some V4 endpoints renamed or merged; see git history and `src/api/server.ts` / `cfoRoutes.ts`

## Known limitations

- Yahoo: some ISINs use **proxy tickers** or have **no** public chart symbol (e.g. AT government bonds) — see `docs/V5_OPEN_ISSUES.md`
- CAS PDF auto-parse not implemented (manual upload only)
- Indian MF entry currently manual (no broker API integration)
- Backtest engine uses monthly resolution beyond the ~3y daily window (by design)

## Migration from V4.1

If running V4.1-hardened, upgrade is in-place:

```text
git fetch
git checkout v5.0
npx prisma migrate deploy
npx prisma generate
npm install
```

Newer dependencies include: `xlsx`, `multer`, `imapflow`, `mailparser`, `@playwright/test`, `js-yaml`, and related stack updates — see `package.json`.

Restart the server (`npm run dev` or `node dist/api/server.js` after `npm run build`).

**Real data import:** `node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/import-real-data.ts seed-data/Banking_Input.xlsx`  
**Historical NAVs:** `node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/import-historical-navs.ts` (one-time bulk, several minutes; requires network access to Yahoo / Erste)

## Verification

- `tsc -p tsconfig.build.json`
- `npx vitest run`
- `PW_REUSE_SERVER=1 npx playwright test tests/visual/all-pages.spec.ts` (when a server already listens on `PORT`)
- `node ./node_modules/tsx/dist/cli.mjs scripts/full-smoke.ts` (expects real DB, demo off, server on `PORT` default 3002)
