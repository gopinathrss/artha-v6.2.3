#!/bin/bash
set -e

# System
apt update && apt upgrade -y
apt install -y curl git build-essential ufw

# Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm use 20

# PostgreSQL 16
apt install -y postgresql-16 postgresql-contrib
systemctl enable postgresql
sudo -u postgres createdb artha_v4
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'CHANGE_ME';"

# Caddy (auto-TLS reverse proxy)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# PM2 for process management
npm install -g pm2

# Firewall
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

# App directory
mkdir -p /opt/artha
chown -R $USER:$USER /opt/artha
mkdir -p /var/log/artha
sudo chown -R $USER:$USER /var/log/artha

echo "Bootstrap complete. Next steps:"
echo "  1. cd /opt/artha"
echo "  2. git clone <your repo>"
echo "  3. npm install && npm run build"
echo "  4. cp deploy/Caddyfile /etc/caddy/Caddyfile"
echo "  5. systemctl restart caddy"
echo "  6. pm2 start deploy/ecosystem.config.js"
echo "  7. pm2 save && pm2 startup"
