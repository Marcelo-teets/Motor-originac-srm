#!/usr/bin/env bash
set -euo pipefail

validate_neon_url() {
  node --input-type=module - "$1" <<'NODE'
const value = process.argv[2] || '';
if (!value) throw new Error('Neon database URL is empty.');
const parsed = new URL(value);
if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
  throw new Error('Database URL must use postgres/postgresql.');
}
if (!parsed.hostname.endsWith('.neon.tech')) {
  throw new Error('Database URL does not point to Neon.');
}
NODE
}

DATABASE_VALUE="${MOTOR_NEON_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$DATABASE_VALUE" ]]; then
  : "${VERCEL_TOKEN:?VERCEL_TOKEN is required when Neon URL is not already present}"

  VERCEL_ORG_ID="${VERCEL_ORG_ID:-team_PJwucES3YmFbxf57HE52Bw0v}"
  VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-prj_hsB473e7bNF0xOd6CEUwo7WFgNYs}"
  VERCEL_PROJECT_NAME="${VERCEL_PROJECT_NAME:-motor-originac-srm}"
  VERCEL_CLI_VERSION="${VERCEL_CLI_VERSION:-50.28.0}"

  mkdir -p .vercel
  cat > .vercel/project.json <<JSON
{"orgId":"$VERCEL_ORG_ID","projectId":"$VERCEL_PROJECT_ID","projectName":"$VERCEL_PROJECT_NAME"}
JSON

  npx --yes "vercel@$VERCEL_CLI_VERSION" pull     --yes     --environment=production     --token="$VERCEL_TOKEN" >/dev/null

  ENV_FILE=".vercel/.env.production.local"
  test -f "$ENV_FILE" || { echo "Vercel production env file was not materialized." >&2; exit 1; }

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  DATABASE_VALUE="${MOTOR_NEON_DATABASE_URL:-${DATABASE_URL:-}}"
fi

validate_neon_url "$DATABASE_VALUE"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "::add-mask::$DATABASE_VALUE"
  printf 'MOTOR_NEON_DATABASE_URL=%s\n' "$DATABASE_VALUE" >> "$GITHUB_ENV"
fi

export MOTOR_NEON_DATABASE_URL="$DATABASE_VALUE"
rm -f .vercel/.env.production.local 2>/dev/null || true

echo "Neon production database environment loaded without exposing credentials."
