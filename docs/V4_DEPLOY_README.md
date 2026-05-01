# ARTHA V4 — Deployment notes

## Health endpoints

- **`GET /healthz`** — Plain-text liveness probe. Returns **`200`** with body **`OK`** when the real database answers `SELECT 1`. Returns **`503`** with body **`FAIL: …`** if the DB is unreachable. Use for UptimeRobot, Pingdom, Kubernetes liveness, or any monitor that only needs a fast yes/no.

- **`GET /api/health`** — JSON payload with named checks (`DB_HEALTH`, `FX_FRESHNESS`, `AI_RECENT_FAILURES`, `CRON_HEALTH`, …) and a `trustScore`. Use for dashboards and deeper diagnostics.

## Environment

- **`DATABASE_URL`** and **`DATABASE_URL_DEMO`** are both **required** and must point to **different** databases. See `docs/F6_1_DEMO_ISOLATION.md`.

## Observability (post Area 5)

- **`GET /api/cron/recent`** — Last 50 `CronExecution` rows (job name, status, duration, errors).
- **`GET /api/ai/recent-errors`** — Last 20 `SystemHealth` rows with `checkName = AI_CALL_FAILURE`.
