# PIE VPS deployment (Contabo Ubuntu)

Coexists with **n8n** (default **5678**). PIE listens on **3002** by default — no port conflict if each app uses its own port and Nginx `server_name` / path routing.

## Prerequisites

- Node.js **20+** (`nvm install 20`)
- PostgreSQL **15+**
- **PM2** (`npm i -g pm2`)
- **Nginx** (reverse proxy)
- **Git**

## 1. Clone

```bash
sudo mkdir -p /opt
sudo chown "$USER:$USER" /opt
cd /opt
git clone <YOUR_PIE_REPO_URL> pie
cd pie
npm ci
```

## 2. Environment

```bash
cp .env.example .env
nano .env
```

Set at minimum: `DATABASE_URL`, `DATABASE_URL_DEMO`, `SESSION_SECRET`, `NODE_ENV=production`, `PIE_PUBLIC_URL`, and secret key path — see [ENV_VARS.md](./ENV_VARS.md).

## 3. Database

```bash
sudo -u postgres psql -c "CREATE DATABASE pie_v6;"
sudo -u postgres psql -c "CREATE USER pie WITH PASSWORD 'STRONG_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE pie_v6 TO pie;"
# PostgreSQL 15+: grant schema
sudo -u postgres psql -d pie_v6 -c "GRANT ALL ON SCHEMA public TO pie;"
```

Point `DATABASE_URL` at this database, then:

```bash
npx prisma migrate deploy
npm run build
```

## 4. Secret keyfile (integration encryption)

```bash
mkdir -p ~/.artha
# From your office machine:
# scp ~/.artha/secret.key user@vps:~/.artha/secret.key
chmod 600 ~/.artha/secret.key
```

In `.env`:

```env
PIE_SECRET_KEY_PATH=/home/youruser/.artha/secret.key
```

If you start fresh on VPS, PIE can create a new keyfile at first run — you must **re-enter** integration API keys in Settings.

## 5. PM2

```bash
npm install -g pm2
cd /opt/pie
pm2 start npm --name pie -- run start
pm2 save
pm2 startup
```

- **`npm run start`** — compiled `dist/` with `--max-old-space-size=512` and `--env-file=.env`.
- **`npm run start:tsx`** — run TypeScript directly (simpler for trials; less ideal for production).

## 6. Nginx

```nginx
server {
  listen 80;
  server_name pie.yourdomain.com;

  auth_basic "PIE Private";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Create htpasswd: `sudo htpasswd -c /etc/nginx/.htpasswd youruser`

**n8n:** usually on **5678** with its own `server { }` or `location /n8n/`. Keep PIE on a separate `server_name` or path.

## 7. Ports / firewall

| Service | Port | Public |
| ------- | ---- | ------ |
| SSH | 22 | yes |
| HTTP | 80 | yes |
| HTTPS | 443 | yes (after Certbot) |
| PIE (Node) | 3002 | **no** — only via Nginx |
| n8n | 5678 | optional / internal |

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 8. SSL (recommended)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d pie.yourdomain.com
```

## 9. Post-deploy checks

- [ ] `curl -s http://127.0.0.1:3002/api/health | head` (on server)
- [ ] `./scripts/vps/health-check.sh https://pie.yourdomain.com` (through Nginx if Basic Auth allows curl — may need `-u user:pass`)
- [ ] Open `/login.html`, complete dashboard auth if enabled
- [ ] Re-save AI / SMTP secrets if keyfile changed
- [ ] Next day: confirm `daily-snapshot` in Cron ledger / snapshot date fresh

## Rollback

Restore DB from `pg_dump` taken before deploy; redeploy previous git tag; `pm2 restart pie`.
