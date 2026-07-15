#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

matches=$(grep -R "localhost:4000" -n "$ROOT" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git \
  --exclude="check-no-localhost.sh" \
  --exclude="*.md" \
  --exclude=".env.example" \
  --exclude="*.example" || true)

if [[ -n "$matches" ]]; then
  echo "ERRO: localhost hardcoded encontrado em código de produção:"
  echo "$matches"
  exit 1
fi

echo "OK: nenhum localhost hardcoded encontrado em código de produção."
