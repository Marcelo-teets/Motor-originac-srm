#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

if [[ ! -f "$ENV_FILE" && -f "$EXAMPLE_FILE" ]]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
fi

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    python3 - <<PY
from pathlib import Path
path = Path(r"$ENV_FILE")
key = "$1"
value = """$2"""
lines = path.read_text().splitlines()
out = []
replaced = False
for line in lines:
    if line.startswith(f"{key}="):
        out.append(f"{key}={value}")
        replaced = True
    else:
        out.append(line)
if not replaced:
    out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

for key in \
  PORT \
  USE_SUPABASE \
  BOOTSTRAP_SUPABASE \
  SUPABASE_URL \
  SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY \
  VITE_API_BASE_URL \
  VITE_SUPABASE_URL \
  VITE_SUPABASE_ANON_KEY; do
  value="${!key:-}"
  if [[ -n "$value" ]]; then
    set_env_value "$key" "$value"
  fi
done

cat <<'EOF'

✅ Codespaces do Motor preparado.

Comandos sugeridos:
- npm run dev:backend
- npm run dev:frontend -- --host 0.0.0.0
- npm run build
- npm run typecheck

Se você configurou os Codespaces Secrets do repositório,
o script já tentou hidratar o arquivo .env automaticamente.
EOF
