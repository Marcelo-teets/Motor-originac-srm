#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is missing}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is missing}"

export USE_SUPABASE=true
exec npx tsx scripts/capture/run-bounded-capture-batch.ts
