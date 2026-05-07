# V5.2 — strict health & deploy gates

## `/healthz` (liveness)

| Behavior | Condition |
|----------|-----------|
| **200** `OK` | Real DB `SELECT 1` succeeds. |
| **503** `FAIL: …` | DB unreachable or query throws. |
| **200** `OK (no AI integrations enabled — optional)` | DB OK, zero enabled AI providers (informational suffix). |
| **503** `FAIL: no enabled AI provider…` | `PIE_HEALTHZ_STRICT_AI=1` or legacy `ARTHA_HEALTHZ_STRICT_AI=1` **and** no enabled `IntegrationProvider` with `category: ai`. |

**When to use strict AI:** internal stacks where “green” must imply AI is configured (e.g. staging before demo). **Unset** for production if AI is genuinely optional.

Implementation: `src/api/server.ts` — `app.get('/healthz', …)`.

## `/api/health` (readiness / SRE)

- JSON payload with per-check `PASS` / `WARN` / `FAIL` and trust score.
- Used by dashboard shell and `npm run v52-smoke`.
- Not a single-bit liveness probe; pair with `/healthz` for load balancers.

## Smoke script

`npm run v52-smoke` — hits `/healthz`, `/api/app-settings`, `/api/integrations`, `/api/settings`, `/api/health` (override base with `ARTHA_SMOKE_BASE`).

## Related

- Area 5 reconciliation: `docs/V52_AREA5_CLOSURE.md`.
- Production checklist: `docs/V5_PRODUCTION_CHECKLIST.md`.
