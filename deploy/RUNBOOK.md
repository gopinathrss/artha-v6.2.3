# ARTHA V4 Operations Runbook

## Initial deployment

1. Provision a VPS (e.g. Hetzner CX22 or similar).
2. SSH in as a sudo-capable user (or root for `setup.sh`).
3. Run: `bash deploy/setup.sh` (edit PostgreSQL password; replace `CHANGE_ME` before going live).
4. Clone the application to `/opt/artha` and check out the release tag (e.g. `v4.0.0`).
5. Copy `deploy/.env.production.example` to `/opt/artha/.env` and fill secrets.
6. `npm install && npm run build`
7. `npx prisma migrate deploy`
8. `pm2 start deploy/ecosystem.config.js`
9. `pm2 save && pm2 startup`
10. Point DNS A record: `artha.yourdomain.com` → server public IP.
11. Install Caddyfile: `sudo cp deploy/Caddyfile /etc/caddy/Caddyfile` and replace the hostname. `sudo systemctl restart caddy`
12. Schedule backups: `crontab -e` → `0 3 * * * PGPASSWORD=... /opt/artha/deploy/backup.sh >> /var/log/artha/backup.log 2>&1`

## Common operations

### Deploy an update

```bash
cd /opt/artha
git pull
npm install
npm run build
npx prisma migrate deploy
pm2 restart artha-v4
```

### View logs

- `pm2 logs artha-v4`
- `tail -f /var/log/artha/out.log`

### Restart

- `pm2 restart artha-v4`

### Database shell

- `sudo -u postgres psql artha_v4`

### Manual backup

- `bash /opt/artha/deploy/backup.sh` (set `PGPASSWORD` / `PGHOST` as needed)

### Restore

- `bash /opt/artha/deploy/restore.sh /var/backups/artha/artha_v4_YYYYMMDD_HHMMSS.sql.gz`

## Rollback

1. `cd /opt/artha`
2. `git log --oneline -10` and find a good commit or tag
3. `git checkout <good_commit>`
4. `npm install && npm run build`
5. `npx prisma migrate deploy` (only if schema is compatible)
6. `pm2 restart artha-v4`

## Monitoring

- `pm2 status`
- `df -h` / `free -m`
- `curl -s http://localhost:3002/api/health | head`

## Emergency

- Hetzner (or your host) support console for access issues.
- Domain DNS at your registrar.
- PostgreSQL: `sudo systemctl restart postgresql` (data directory paths vary by distro).
