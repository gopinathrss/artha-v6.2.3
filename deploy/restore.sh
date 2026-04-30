#!/bin/bash
# Restore from backup
set -e
if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup_file.sql.gz>"
  exit 1
fi
export PGPASSWORD="${PGPASSWORD:-}"
gunzip < "$1" | psql -U postgres -h "${PGHOST:-localhost}" artha_v4
