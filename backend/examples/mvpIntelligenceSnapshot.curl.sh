#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"

AUTH_HEADER=()
if [[ -n "$ACCESS_TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $ACCESS_TOKEN")
fi

echo "GET ${API_BASE_URL}/mvp/intelligence-snapshot"

curl "${API_BASE_URL}/mvp/intelligence-snapshot" \
  -H "Content-Type: application/json" \
  "${AUTH_HEADER[@]}"

echo
