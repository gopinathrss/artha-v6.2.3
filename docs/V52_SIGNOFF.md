# ARTHA V5.2 — implementation sign-off (Cursor)

**Status:** In-repo **V5.2 completion pack** shipped: SOT map, VPS architecture doc, health gates doc, Area 5 closure pointer, optional external read API gate, Playwright E2E slice, richer Integrations UX (clear / remove / history / secret hints). Production verification (VPS soak, full browser matrix) remains on your environment.

## Delivered in this pass

- **Schema:** `AppSettings`, `IntegrationProvider`, `IntegrationStatus` + migration `20260502180000_v52_integration_app_settings`.
- **Merge layer:** `appSettingsMerge.ts` (`ensureAppSettings`, `getMergedSettings`) — safe if migration not applied yet.
- **Integrations:** `src/lib/integrations/*` (registry, store with AES envelopes, env bootstrap, AI router + OpenAI/Anthropic/Gemini, SMTP helper, FX helper, tests runner).
- **APIs:** `registerAppSettingsRoutes`, `registerIntegrationsRoutes` (list/get/post/delete/test/set-default/status + rate limit on tests).
- **Consumers:** `aiIntelligence` (router + legacy fallback), `currency`, `emailService`, `telegram/bot`, `reports/aiBrief`, `health`, `portfolio`, `allocationPlanner`, `pruneOldRows`, demo mode, `/api/settings` sync to `AppSettings`. **SOT:** `docs/V52_SOT_MAP.md` (includes remaining legacy-first readers for transparency).
- **Dashboard:** `theme.js` (AUTO/LIGHT/DARK + `/api/app-settings/theme`), overview targets + alerts + error banner, shell trust score dedup on `/`.
- **Settings UI (V5.2):** `settings.html` / `settings.js` — **App preferences** card (`GET/POST /api/app-settings`) and **Integrations** grid (`GET/POST /api/integrations/*`, Test, Set default AI, **section status panels**, **Disable & clear / Remove row**, **expandable status history**, **secret field help**).
- **External read API (optional):** `ARTHA_EXTERNAL_API_KEY` + `registerExternalReadApiGate` — `docs/V52_EXTERNAL_API.md`, `src/api/externalReadApiGate.ts`, `tests/unit/externalReadApiGate.test.ts`.
- **Deploy / VPS:** `docs/V52_VPS_DEPLOY.md`, **`docs/V52_VPS_ARCHITECTURE.md`**, `docs/V52_SECRET_ROTATION.md`, `deploy/ecosystem.config.cjs`, `deploy/nginx/artha.conf`.
- **Health gates:** **`docs/V52_HEALTH_GATES.md`** — `ARTHA_HEALTHZ_STRICT_AI` implemented in `server.ts` `/healthz`.
- **Area 5 / E2E / SOT:** **`docs/V52_AREA5_CLOSURE.md`**, **`docs/V52_SOT_MAP.md`**, **`tests/e2e/`** + `tests/e2e/v52.e2e.md`, `npm run test:e2e`.
- **Scripts:** `npm run migrate:v52`, `scripts/migrate-settings-to-v52.ts`.
- **Tests:** `tests/unit/validators/appSettings.test.ts`; `vitest` + gate unit tests; Playwright E2E slice.

## Preconditions on your machine

1. `npx prisma migrate deploy` then `npx prisma generate` (retry if Windows EPERM on `query_engine-windows.dll.node`).
2. `npm run migrate:v52` after backup.

## Backlog (optional follow-up)

- `comms.imap` automated test + orchestrator refactor depth.
- TLS `rejectUnauthorized` flag UX + removal of default `false` for production SMTP in legacy path.
- Align **telegram / scheduler / triggers / aiBrief** on `getMergedSettings` where fields duplicate `Settings` (see SOT map).
