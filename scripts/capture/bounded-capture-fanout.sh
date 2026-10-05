#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MOTOR_NEON_DATABASE_URL:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "MOTOR_NEON_DATABASE_URL or DATABASE_URL is missing" >&2
  exit 1
fi

exec npx tsx scripts/capture/run-bounded-capture-batch.ts
