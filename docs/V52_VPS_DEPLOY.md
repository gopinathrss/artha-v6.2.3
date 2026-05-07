# ARTHA V5.2 — VPS deployment (Ubuntu + n8n co-existence)

**Architecture (diagrams, ports, trust):** `docs/V52_VPS_ARCHITECTURE.md`  
**SOT map (routes, consumers, DB):** `docs/V52_SOT_MAP.md`

## Layout

- **Artha**: Node 22, `PORT=3002`, PM2 (`deploy/ecosystem.config.cjs`), Nginx `https://artha.<domain>/` → `proxy_pass http://127.0.0.1:3002`.
- **n8n**: existing install (e.g. port **5678**), `https://n8n.<domain>/`.
- **Postgres 16**: databases `artha_v4`, `artha_v4_demo`, `n8n` (separate DBs, shared instance).

## Steps (outline)

1. Install Node 22, Postgres 16, Nginx, Certbot; create OS user `artha`.
2. Clone repo to `/var/www/artha`, `npm ci`, `npx prisma migrate deploy`, `npm run build`.
3. Copy `.env` and ensure `ARTHA_SECRET_KEY_PATH` or default `%APPDATA%/artha/secret.key` (Linux: `~/.config/artha/secret.key` if `APPDATA` unset — set explicitly in production).
4. `pm2 start deploy/ecosystem.config.cjs` — verify `pm2 logs artha`.
5. Nginx: see `deploy/nginx/artha.conf` (gzip, static cache for `/charts`, `/scripts`, `/styles`, `/vendor/echarts`, `client_max_body_size 10m`).
6. **Backups**: `pg_dumpall` or per-DB `pg_dump` cron; include a copy of the secret keyfile (see secret rotation doc).

## n8n

- Do not share Artha’s `DATABASE_URL` with n8n’s DB.
- Optional workflows: HTTP Request to `GET /api/overview`, `POST /api/...`. If Artha is reachable beyond a trusted network, set **`ARTHA_EXTERNAL_API_KEY`** and send `Authorization: Bearer …` or `X-Artha-Api-Key` from n8n (same-origin browsers still work without the key). See **`docs/V52_EXTERNAL_API.md`**.

## After deploy

- Run `npm run migrate:v52` once to seed `IntegrationProvider` rows from legacy `Settings` secrets.
- With the server listening, run `npm run v52-smoke` (override base URL with `ARTHA_SMOKE_BASE=https://artha.example/`).
- Open **Settings → Integrations** (or use REST `/api/integrations`) to confirm masked secrets and run **Test** per provider.
- Optional load balancer gate: set `ARTHA_HEALTHZ_STRICT_AI=1` so `/healthz` returns **503** when no AI integration is enabled (clear for internal stacks; leave unset if AI is optional).
