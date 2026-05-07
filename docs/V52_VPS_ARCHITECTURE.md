# V5.2 — VPS / deploy architecture (complete)

Companion to `docs/V52_VPS_DEPLOY.md` (step-by-step). This page is the **structural** view: processes, ports, and trust boundaries.

## Topology (single VPS)

```
                    Internet
                        │
                   [ Nginx TLS ]
                   /           \
          artha.example    n8n.example
                │                │
         proxy_pass          proxy_pass
         127.0.0.1:3002     127.0.0.1:5678
                │                │
            [ PM2: artha ]   [ n8n ]
                │
        ┌───────┴────────┐
        │   Node 22      │
        │ express :3002  │
        └───────┬────────┘
                │
     ┌──────────┴──────────┐
     │   PostgreSQL 16     │
     │ artha_v4 │ artha_v4_demo │ n8n (separate DB) │
     └─────────────────────┘
```

## Processes

| Process | Working dir | Port | Supervisor |
|---------|-------------|------|------------|
| Artha API + static UI | `/var/www/artha` | `3002` (default) | PM2 (`deploy/ecosystem.config.cjs`) |
| n8n | n8n install | `5678` typical | systemd / PM2 / Docker (your choice) |

## Files on disk (reference)

- `deploy/ecosystem.config.cjs` — `PORT`, `NODE_ENV=production`, `exec_mode`, logs.
- `deploy/nginx/artha.conf` — TLS, gzip, `client_max_body_size`, cache headers for vendor assets.
- `~/.config/artha/secret.key` or `ARTHA_SECRET_KEY_PATH` — AES for integration secrets (see `docs/V52_SECRET_ROTATION.md`).

## Trust boundaries

1. **Browser → Artha** — Same origin; dashboard uses cookies only where applicable; no public user accounts in default single-tenant model.
2. **n8n → Artha** — Prefer **loopback** or **private network** + optional `ARTHA_EXTERNAL_API_KEY` (see `docs/V52_EXTERNAL_API.md`). Do not point n8n at `DATABASE_URL` used by Artha.
3. **Internet → Postgres** — Must **not** be exposed; bind `127.0.0.1` or security group deny.

## Observability

- Uptime: `GET /healthz` (text `OK` / `FAIL`).
- Deep state: `GET /api/health` (JSON checks).
- Strict deploy gate: `ARTHA_HEALTHZ_STRICT_AI=1` — see `docs/V52_HEALTH_GATES.md`.

## Backup scope

- `pg_dump` of `artha_v4` and `artha_v4_demo` on separate schedules if you use demo for experiments.
- Copy of secret keyfile **offline** (loss = cannot decrypt integration rows).

## Build pipeline on VPS

```bash
cd /var/www/artha && git pull && npm ci && npx prisma migrate deploy && npm run build
pm2 reload ecosystem.config.cjs --only artha
```

After schema changes: always `prisma migrate deploy` before `npm run build`.
