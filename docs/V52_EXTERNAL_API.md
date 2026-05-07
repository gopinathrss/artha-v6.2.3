# V5.2 — external read API hardening (optional)

## Purpose

When Artha is reachable from **automation** (n8n on another host, cron `curl`) and you still want **browser dashboards** on the same URL without embedding secrets in HTML, use the optional **read API gate**.

## Environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `PIE_EXTERNAL_API_KEY` (or legacy `ARTHA_EXTERNAL_API_KEY`) | Yes, to enable | Shared secret; non-empty activates the gate. |
| `PIE_EXTERNAL_API_PATHS` (or legacy `ARTHA_EXTERNAL_API_PATHS`) | No | Comma-separated `req.path` values. Default: `/api/overview,/api/holdings,/api/health,/api/this-month,/api/alerts`. |

## Client rules

1. **Same-origin browser** — Modern browsers send `Sec-Fetch-Site: same-origin` for fetches from your dashboard; those requests **do not** need the key.
2. **n8n / curl / server workers** — Send either:
   - `Authorization: Bearer <key>`, or  
   - `X-Pie-Api-Key: <key>` (legacy `X-Artha-Api-Key` still accepted)

Otherwise the server responds **401** with a JSON `error` explaining the gate.

## Security notes

- Prefer **network isolation** (n8n → Artha over private IP or localhost) when possible; this gate is **defense in depth**, not a substitute for firewalling Postgres.
- **POST** / mutating routes are **not** covered by this middleware; keep those off the public internet or protect with separate auth at Nginx or application layer.
- Do **not** commit the key to git; set in PM2 env or systemd `Environment=`.

## Implementation

`src/api/externalReadApiGate.ts` — registered from `src/api/server.ts` before JSON `GET` handlers on the paths above.
