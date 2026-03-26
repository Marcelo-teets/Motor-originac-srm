#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
PAYLOAD_FILE="${PAYLOAD_FILE:-backend/examples/mvpPersistenceBootstrap.payload.json}"

if [[ ! -f "$PAYLOAD_FILE" ]]; then
  echo "Payload file not found: $PAYLOAD_FILE" >&2
  exit 1
fi

AUTH_HEADER=()
if [[ -n "$ACCESS_TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $ACCESS_TOKEN")
fi

echo "POST ${API_BASE_URL}/mvp/persistence-bootstrap"

curl -X POST "${API_BASE_URL}/mvp/persistence-bootstrap" \
  -H "Content-Type: application/json" \
  "${AUTH_HEADER[@]}" \
  --data-binary "@${PAYLOAD_FILE}"

echo
