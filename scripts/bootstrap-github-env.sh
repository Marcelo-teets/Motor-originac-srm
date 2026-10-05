#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"

require_secret() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "[bootstrap-github-env] missing required variable: $key" >&2
    exit 1
  fi
}

write_line() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

require_secret MOTOR_NEON_DATABASE_URL
require_secret NEON_AUTH_BASE_URL
require_secret NEON_AUTH_JWKS_URL

: "${PORT:=4000}"
: "${MOTOR_DATA_PROVIDER:=neon}"
: "${VITE_API_BASE_URL:=http://localhost:${PORT}}"
: "${VITE_NEON_AUTH_URL:=$NEON_AUTH_BASE_URL}"

mkdir -p "$(dirname "$ENV_FILE")"
: > "$ENV_FILE"

write_line PORT "$PORT"
write_line MOTOR_DATA_PROVIDER "$MOTOR_DATA_PROVIDER"
write_line MOTOR_NEON_DATABASE_URL "$MOTOR_NEON_DATABASE_URL"
write_line NEON_AUTH_BASE_URL "$NEON_AUTH_BASE_URL"
write_line NEON_AUTH_JWKS_URL "$NEON_AUTH_JWKS_URL"
write_line VITE_API_BASE_URL "$VITE_API_BASE_URL"
write_line VITE_NEON_AUTH_URL "$VITE_NEON_AUTH_URL"

echo "[bootstrap-github-env] wrote $ENV_FILE"
