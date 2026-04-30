#!/bin/bash
# Daily backup script - run via cron
set -e
export PGPASSWORD="${PGPASSWORD:-}"
BACKUP_DIR="/var/backups/artha"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -U postgres -h "${PGHOST:-localhost}" artha_v4 | gzip > $BACKUP_DIR/artha_v4_$TIMESTAMP.sql.gz

# Retention: keep 30 days
find $BACKUP_DIR -name "artha_v4_*.sql.gz" -mtime +30 -delete

echo "Backup complete: artha_v4_$TIMESTAMP.sql.gz"
