# V5.2 — source-of-truth map (SOT)

Single map for **where settings live**, **who reads them**, and **which HTTP surfaces matter**. Use this for audits, VPS handover, and Playwright scope.

## Data stores

| Store | Prisma model | Role |
|--------|----------------|------|
| **App preferences & targets** | `AppSettings` (`id: default`) | V5.2 canonical for theme, display CCY, risk, demo, retention, allocation targets, default AI key, flags. |
| **Legacy settings** | `Settings` (first row) | SMTP/IMAP passwords via `secrets`, alert email, IMAP host, legacy AI keys; **merged** into API responses where `getMergedSettings` runs. |
| **Integrations** | `IntegrationProvider`, `IntegrationStatus` | Per-provider config + AES envelopes; AI router, SMTP send path, tests, status history. |

Merge layer: `src/lib/appSettingsMerge.ts` — `getMergedSettings`, `ensureAppSettings`, `appSettingsPatchData`.

## HTTP — settings & integrations

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/api/app-settings` | Merged app prefs + PATCH fields validated in `validators/appSettings.ts`. |
| GET | `/api/app-settings/theme` | Theme for shell (`theme.js`). |
| GET | `/api/integrations` | List providers (masked secrets). |
| GET/POST | `/api/integrations/:key` | Upsert provider. |
| DELETE | `/api/integrations/:key?hard=1` | Soft: disable + clear secrets; hard: delete row. |
| POST | `/api/integrations/:key/test` | Rate-limited test runner. |
| POST | `/api/integrations/:key/set-default` | AI default only. |
| GET | `/api/integrations/:key/status` | Recent `IntegrationStatus` rows. |
| GET/POST | `/api/settings` | Legacy; deprecation header; syncs AI keys to `AppSettings` where applicable. |

## HTTP — automation & probes

| Path | Purpose |
|------|---------|
| `GET /healthz` | Liveness + DB `SELECT 1`; optional **strict AI** via `ARTHA_HEALTHZ_STRICT_AI=1`. |
| `GET /api/health` | Rich checks + trust score (dashboard + smoke). |
| GET (optional gate) | Default list in `docs/V52_EXTERNAL_API.md` when `ARTHA_EXTERNAL_API_KEY` is set (`externalReadApiGate.ts`). |

## Runtime consumers of merged / integrations

| Area | Module(s) | Notes |
|------|-----------|--------|
| Demo mode | `server.ts` `isDemoMode`, `getPrisma` | `getMergedSettings` → `demoModeEnabled`. |
| Portfolio summary | `portfolio.ts` | Targets, risk → blended return weights, `goalFV` / `projectedFV`. |
| Allocation planner | `allocationPlanner.ts` | Merged targets + flags. |
| AI Ask | `aiIntelligence.ts`, `integrations/ai/router.ts` | Router + legacy fallback; `aiDebugLogging` from merge. |
| Prune / retention | `cron/pruneOldRows.ts` | Retention days from merge. |
| Email send | `emailService.ts` | **Integrations first** (`comms.smtp`), then legacy `Settings` + `getSecret`. |
| CFO / health | `cfoRoutes.ts`, `health.ts` | Legacy `Settings` for several probes; see backlog to align on merge where fields overlap. |
| Reports / triggers | `reports/aiBrief.ts`, `triggers.ts`, `scheduler.ts`, `telegram/bot.ts` | Mostly legacy `Settings` for alerts / SMTP presence checks; email body uses `sendEmail` integration path when configured. |

**Consumer wiring status:** Financial core (portfolio, planner, prune, demo, AI router) uses **merge + integrations** for V5.2 fields. Operational paths that still touch **`Settings` first** (telegram, scheduler, triggers, `aiBrief` open keys) remain **documented** for a future pass if you want a single read path everywhere.

## Dashboard scripts touching `/api/app-settings` or `/api/integrations`

- `settings.js` — full V5.2 UI.
- `theme.js` — theme GET/POST.

## Related docs

- `docs/V52_VPS_DEPLOY.md` — deploy steps + n8n.
- `docs/V52_VPS_ARCHITECTURE.md` — component diagram + ports.
- `docs/V52_HEALTH_GATES.md` — env gates for `/healthz` and probes.
- `docs/V52_EXTERNAL_API.md` — optional read API key gate.
- `docs/V52_AREA5_CLOSURE.md` — Area 5 checklist pointer.
- `tests/e2e/v52.e2e.md` — Playwright scope.
