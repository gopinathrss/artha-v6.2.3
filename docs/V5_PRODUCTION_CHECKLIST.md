# V5 Production Readiness — Checklist

## Pre-deploy

- [ ] Latest tag is v5.0 (or later)
- [ ] All migrations applied to target DB
- [ ] DATABASE_URL points to production DB (not localhost dev)
- [ ] DATABASE_URL_DEMO is a SEPARATE database
- [ ] .env contains: ANTHROPIC_API_KEY (or OPENAI_API_KEY)
- [ ] .env contains SMTP credentials if email reports desired
- [ ] .env contains TELEGRAM_BOT_TOKEN if Telegram alerts desired
- [ ] backups/ folder is on persistent storage, not container ephemeral
- [ ] Cron jobs registered (server log shows all on startup)

## On first run

- [ ] Open http://\<host\>:3002/ — Overview loads
- [ ] /healthz returns 200
- [ ] Trust score visible in sidebar
- [ ] Generate a plan: see real holdings data
- [ ] Generate a report: HTML renders
- [ ] Visit /backtest, run quick comparison: returns non-zero CAGR
- [ ] Visit /patterns: 60 patterns visible
- [ ] Settings page: theme switching works light/dark/system

## Weekly maintenance (user)

- [ ] Open /this-month after each SIP day (14th)
- [ ] Mark Done/Skip on each row
- [ ] Review /alerts for new ones
- [ ] Read monthly report on the 1st (auto-emailed if configured)

## Monthly maintenance (system)

- [ ] Verify NavHistory growing daily (cron working)
- [ ] Verify HistoricalNavStats updated quarterly
- [ ] Verify RecommendationOutcome rows populated (cron working)
- [ ] Run backups\\artha_v4_$(date).sql via pg_dump and copy off-host

## Disaster recovery

- [ ] Most recent pre-* tag tested via git reset --hard
- [ ] Backup restore tested: dropdb + createdb + psql -f backup.sql

## Security

- [ ] Server not exposed to public internet without TLS
- [ ] If using Cloudflare Tunnel: secret token rotated
- [ ] IMAP password is Gmail App Password, not main password
- [ ] No API keys in git history (check .env never committed)
