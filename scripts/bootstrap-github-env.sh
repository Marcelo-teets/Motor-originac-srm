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

require_secret SUPABASE_URL
require_secret SUPABASE_ANON_KEY
require_secret SUPABASE_SERVICE_ROLE_KEY

: "${PORT:=4000}"
: "${USE_SUPABASE:=true}"
: "${BOOTSTRAP_SUPABASE:=true}"
: "${VITE_API_BASE_URL:=http://localhost:${PORT}}"
: "${VITE_SUPABASE_URL:=$SUPABASE_URL}"
: "${VITE_SUPABASE_ANON_KEY:=$SUPABASE_ANON_KEY}"

mkdir -p "$(dirname "$ENV_FILE")"
: > "$ENV_FILE"

write_line PORT "$PORT"
write_line USE_SUPABASE "$USE_SUPABASE"
write_line BOOTSTRAP_SUPABASE "$BOOTSTRAP_SUPABASE"
write_line SUPABASE_URL "$SUPABASE_URL"
write_line SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
write_line SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
write_line VITE_API_BASE_URL "$VITE_API_BASE_URL"
write_line VITE_SUPABASE_URL "$VITE_SUPABASE_URL"
write_line VITE_SUPABASE_ANON_KEY "$VITE_SUPABASE_ANON_KEY"

echo "[bootstrap-github-env] wrote $ENV_FILE"
