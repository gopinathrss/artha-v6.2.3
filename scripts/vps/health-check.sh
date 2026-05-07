#!/usr/bin/env bash
# Quick health check after VPS deployment (trust score heuristic).
set -euo pipefail
HOST="${1:-http://127.0.0.1:3002}"
echo "Checking PIE at ${HOST}..."
RESPONSE="$(curl -sS -f "${HOST}/api/health" || true)"
if [[ -z "${RESPONSE}" ]]; then
  echo "✗ No response from ${HOST}/api/health"
  exit 1
fi
TRUST="$(echo "${RESPONSE}" | grep -o '"trustScore":[0-9]*' | head -1 | cut -d: -f2)"
if [[ -z "${TRUST}" ]]; then
  echo "✗ Could not parse trustScore from response"
  echo "${RESPONSE}" | head -c 500
  exit 1
fi
echo "Trust score: ${TRUST}"
if [[ "${TRUST}" -gt 60 ]]; then
  echo "✓ PIE health looks acceptable"
  exit 0
else
  echo "✗ PIE trust score is low — check logs and /settings → System health"
  exit 1
fi
