#!/usr/bin/env bash
set -euo pipefail

ROUNDS="${1:-100}"

export SYNC_STORAGE_BACKEND="postgres"
export POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_USER="${POSTGRES_USER:-sync}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-sync}"
export POSTGRES_DB="${POSTGRES_DB:-sync}"

npm run db:migrate

for i in $(seq 1 "$ROUNDS"); do
  echo "[nightly] round ${i}/${ROUNDS}"
  npm run test:pg
done

echo "[nightly] PostgreSQL regression completed: ${ROUNDS} rounds"
