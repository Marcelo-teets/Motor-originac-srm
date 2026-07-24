#!/usr/bin/env bash
set -euo pipefail

assert_exit_code() {
  local expected="$1"
  local label="$2"
  local files="$3"

  set +e
  VERCEL_CHANGED_FILES="$files" bash scripts/vercel-ignore-build.sh >/tmp/vercel-ignore-test.log 2>&1
  local actual=$?
  set -e

  if [[ "$actual" -ne "$expected" ]]; then
    echo "Case '$label' expected exit $expected but received $actual" >&2
    cat /tmp/vercel-ignore-test.log >&2
    exit 1
  fi
}

# exit 0 means ignore; exit 1 means build.
assert_exit_code 0 "docs only" $'docs/runbook.md\n.github/workflows/data.yml'
assert_exit_code 0 "database and Supabase only" $'db/migrations/999_example.sql\nsupabase/functions/source/index.ts'
assert_exit_code 1 "frontend" $'frontend/src/App.tsx'
assert_exit_code 1 "api" $'api/index.ts'
assert_exit_code 1 "backend imported by api" $'backend/src/lib/supabase.ts'
assert_exit_code 1 "build configuration" $'package-lock.json\ntsconfig.serverless.json\nvercel.json'
assert_exit_code 1 "ignore script itself" $'scripts/vercel-ignore-build.sh'

echo "Vercel ignored-build decision tests passed."
