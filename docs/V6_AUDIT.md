# PIE V6 — final audit

Re-run of the three V5.2 audits against the V6 codebase. Any item rated
[BLOCKER] or [HIGH] in V5.2 is restated here with V6 status.

## 1. Editability gaps (V5.2 → V6)

| V5.2 finding | Severity | V6 status |
| --- | --- | --- |
| Portfolio page is read-only — no add/edit/delete | HIGH | **Fixed.** `/portfolio` has a drawer-based CRUD with status, units, NAV, SIP, purchase date. Cashflow drawer per holding (SIP / lump / withdrawal / dividend). |
| No Accounts page (bank/savings/pension/FDs) | BLOCKER | **Fixed.** New `/accounts` page with full CRUD across CZK/EUR/USD/INR/GBP. Soft-delete (`isActive=false`) and dedicated balance update endpoint. |
| India MFs and FDs are view-only | HIGH | **Fixed.** `/india` now has Add/Edit drawers for both lists, wired to existing `/api/india/mf` + `/api/india/fd` CRUD. |
| Cashflows cannot be edited from UI | HIGH | **Fixed.** New `GET/POST/PATCH/DELETE /api/cashflows` plus per-holding drawer. |
| Holding hard-delete impossible | MEDIUM | **Fixed.** `DELETE /api/holdings/:id?hard=1` removes the row; default remains soft (`status=EXITED`). |

## 2. Settings / customization (V5.2 → V6)

| V5.2 finding | Severity | V6 status |
| --- | --- | --- |
| Annual investment target & target date not editable in UI | HIGH | **Fixed.** New "Annual / lifetime target" + "Target date" fields under App preferences. |
| Timezone forced to Europe/Prague at the UI level | MEDIUM | **Fixed.** Timezone selector with major IANA presets. |
| No way to customise accent / brand color | MEDIUM | **Fixed.** Accent picker (Blue/Green/Purple/Amber/Rose) — applied via `data-pie-accent` on `<html>`, persists in `AppSettings.accentColor`, paints before settings.js loads. |
| No backup/restore from UI | HIGH | **Fixed.** Settings → Data & backups: `Download backup` (JSON dump), `Restore from backup…` (additive merge with confirmation phrase). |
| Custom expense categories impossible | LOW | **Fixed.** `customCategories` JSON column on `AppSettings`, free-text editor in Settings. |
| Dashboard auth lived in `.env` only | HIGH | **Fixed in V5.2 final.** UI toggle + bootstrap phrase under App preferences; env retained as recovery only. |

## 3. Hosting / data safety (V5.2 → V6)

| V5.2 finding | Severity | V6 status |
| --- | --- | --- |
| No boot contract — server starts even with missing `SESSION_SECRET` | BLOCKER | **Fixed.** `runBootContract()` prints a one-screen checklist; in `NODE_ENV=production` any FAIL aborts startup. |
| Boot seeds (`seedNREFDRates`, `seedLibraryWithTopETFs`, `bootstrapIntegrationsFromEnvIfNeeded`, `bootstrapSystemHealth`) ran against `getPrisma()` — could write into demo DB if demo mode flipped during boot | HIGH | **Fixed.** All four explicitly take `realPrisma` at boot; demo mode toggling never poisons personal data. |
| `req.ip` returned proxy IP, breaking per-IP rate limits behind Caddy/NGINX | HIGH | **Fixed.** `app.set('trust proxy', 1)`. |
| 5xx handlers leaked internal stack messages to clients | MEDIUM | Mitigated. New `requestContext.ts` exposes `send500()` + `X-Request-Id` header. (Existing handlers retain their own try/catch; `send500` is the new helper for added handlers and any future migration.) |
| SMTP fallback hardcoded `rejectUnauthorized: false` | MEDIUM | **Fixed.** Default is `true`; opt-out via `PIE_SMTP_INSECURE_TLS=1` for self-signed test relays only. |
| OpenAI / Anthropic SDKs had no per-request timeout | MEDIUM | **Fixed.** Both clients constructed with `timeout: 60_000, maxRetries: 1`. |
| IMAP fetch could hang the cron | MEDIUM | **Fixed.** `socketTimeout: 30_000, greetingTimeout: 15_000` on every `ImapFlow` instance. |
| `start-artha.bat` migrated only the personal DB | MEDIUM | **Fixed.** New `scripts/migrate-all.ts` migrates `DATABASE_URL` then `DATABASE_URL_DEMO`; `npm run db:deploy:all`; batch script invokes it. |
| No production env template | HIGH | **Fixed.** `.env.production.example` with explicit comments per field. |
| No deployment runbook | HIGH | **Fixed.** `docs/V6_HOSTING_RUNBOOK.md` covers Caddy, systemd, backups, recovery, the V6 hosting checklist. |
| No restore path for backups | HIGH | **Fixed.** `POST /api/settings/backup/import` (additive merge) + UI flow. |

## 4. UX polish (V5.2 → V6)

| V5.2 finding | Severity | V6 status |
| --- | --- | --- |
| Login page felt like a generic form | LOW | **Fixed.** Two-column layout on ≥960px with brand side, accent gradient, premium card depth, copy. Uses tokens — auto-themed by accent. |
| Hero card lacked depth | LOW | **Fixed.** `overview-hero` now carries `box-shadow: var(--shadow-md)` plus an inner highlight. |
| No central toast / drawer / confirm grammar — pages used `window.confirm` and `alert()` | MEDIUM | **Fixed.** `pieUi.js` exposes `PieUi.{toast, confirm, drawer, btn, skeletonRows}` with reduced-motion support; `fetchJson.js` exposes `PieFetch` with timeout, 401-redirect, and 5xx retry. |
| Empty states had no call-to-action | LOW | **Fixed.** `.empty-state-cta` block on Portfolio, Accounts, India MF, India FD. |

## 5. Out-of-scope for V6 (tracked, not done)

- Audit log viewer UI (audit rows are written; viewer is V6.1).
- Full per-user multi-tenant mode (PIE remains single-user / single-instance).
- Mobile app or responsive overhaul of dense data tables (acceptable on tablet, not optimised below 540px).

## 6. Verdict

All [BLOCKER] and [HIGH] items from the three V5.2 audits are resolved in V6.
Remaining [MEDIUM]/[LOW] items have working mitigations. V6 is hosting-ready
once the runbook checklist passes on the target host.
