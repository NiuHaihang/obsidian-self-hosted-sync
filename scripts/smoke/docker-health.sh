#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8787}"

health=$(curl -sS "${BASE_URL}/healthz")
ready=$(curl -sS "${BASE_URL}/readyz")
migration=$(curl -sS "${BASE_URL}/v1/admin/migrations/status")

echo "healthz: ${health}"
echo "readyz: ${ready}"
echo "migration: ${migration}"

case "${health}" in
  *"\"status\":\"ok\""*) ;;
  *) echo "healthz failed"; exit 1;;
esac

case "${ready}" in
  *"\"status\":\"ready\""*) ;;
  *) echo "readyz failed"; exit 1;;
esac

case "${migration}" in
  *"\"current_version\""*) ;;
  *) echo "migration status failed"; exit 1;;
esac

echo "docker smoke check passed"
