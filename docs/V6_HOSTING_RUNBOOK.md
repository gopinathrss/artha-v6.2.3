# PIE V6 — Hosting runbook

Single-box deployment. Linux preferred, Windows supported via `start-artha.bat`.

## 1. Prerequisites

- Postgres 14+ (separate DBs for personal + demo).
- Node.js 22 LTS.
- A reverse proxy (Caddy or NGINX) with TLS.
- A backup target (object storage, NAS, or external disk).

## 2. First-time setup

```bash
# 2.1 Clone
git clone <repo> /opt/pie
cd /opt/pie

# 2.2 Install
npm ci

# 2.3 Configure
cp .env.production.example .env
$EDITOR .env   # set DATABASE_URL, DATABASE_URL_DEMO, SESSION_SECRET, PIE_PUBLIC_URL

# 2.4 Create databases as a Postgres superuser
createdb pie_personal
createdb pie_demo

# 2.5 Apply schema to BOTH dbs
npm run db:deploy:all

# 2.6 First boot — V6 boot contract will print a green checklist
NODE_ENV=production node --env-file=.env dist/api/server.js
```

## 3. Reverse proxy (Caddy)

```caddy
pie.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:3002
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
    }
}
```

Caddy auto-renews TLS. The Express app trusts one proxy hop (`trust proxy=1`)
so `req.ip` and rate limits stay accurate.

## 4. systemd service

`/etc/systemd/system/pie.service`:

```ini
[Unit]
Description=PIE — Personal Investment Engine
After=network.target postgresql.service

[Service]
Type=simple
User=pie
WorkingDirectory=/opt/pie
EnvironmentFile=/opt/pie/.env
ExecStart=/usr/bin/node dist/api/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pie
sudo systemctl status pie
```

## 5. First login

1. Open `https://pie.example.com/login.html`.
2. PIE redirects you here whenever **Settings → Dashboard login** is on.
3. On the very first run set the **bootstrap phrase** under
   *Settings → App preferences → Bootstrap phrase* (saved hashed in
   `AppSettings.dashboardBootstrapKeyHash`), then come back to `/login.html`
   and choose a real password.

## 6. Backups

The Settings → Data & backups card downloads a JSON snapshot. For
production we still recommend nightly `pg_dump` to your backup target:

```bash
pg_dump --no-owner --no-acl --format=custom \
  -d pie_personal -f /var/backups/pie/personal-$(date +%F).pgcustom

# rotate after 30 days
find /var/backups/pie -name 'personal-*.pgcustom' -mtime +30 -delete
```

The encrypted secrets in `IntegrationProvider` only decrypt with the matching
**key file** (`PIE_SECRET_KEY_PATH`). Back the key file up alongside dumps —
losing it means re-entering every API key on restore.

## 7. Health & monitoring

- `GET /healthz` — text/plain. Returns `OK` or `FAIL: <reason>`. Wire this
  into your monitor (UptimeKuma, Pingdom, etc.).
- `GET /api/health` — JSON detail (auth-gated when login is on). Source of
  truth for staleness checks (FX, RBI, NRE FD rates, scheduler, cron).
- Every API response carries `X-Request-Id`. Logs grep on this id to trace
  a request end-to-end.

## 8. Upgrades

```bash
cd /opt/pie
git pull
npm ci
npm run db:deploy:all     # idempotent
sudo systemctl restart pie
```

The boot contract aborts startup if a critical setting is missing
(`SESSION_SECRET`, `DATABASE_URL`, etc.) so a broken config can't reach prod.

## 9. Recovery

If you lose access to dashboard login:

```bash
# Append to .env on the host, restart the service
echo "PIE_DASHBOARD_AUTH=0" >> .env
sudo systemctl restart pie
```

This forces dashboard auth off regardless of `AppSettings`. Sign in,
re-set the password under Settings, remove the env line, restart.

## 10. Hosting checklist (V6)

- [ ] `DATABASE_URL` and `DATABASE_URL_DEMO` are distinct.
- [ ] `SESSION_SECRET` is 32+ random chars.
- [ ] `PIE_PUBLIC_URL` is set and matches the reverse-proxy domain.
- [ ] `PIE_SECRET_KEY_PATH` is on a backed-up volume.
- [ ] Reverse proxy enforces TLS and HSTS.
- [ ] Postgres role is non-superuser, scoped to the two DBs.
- [ ] `pg_dump` cron runs nightly; restore tested at least once.
- [ ] systemd unit `pie.service` is `enabled` and `Restart=on-failure`.
- [ ] `/healthz` is wired into a monitor.
- [ ] Boot contract printed all-green on the last restart.
