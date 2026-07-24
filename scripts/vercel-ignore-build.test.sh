#!/usr/bin/env bash

set -euo pipefail

run_case() {
  local ref="$1"
  local expected="$2"
  local actual

  set +e
  VERCEL_GIT_COMMIT_REF="$ref" bash scripts/vercel-ignore-build.sh >/tmp/vercel-ignore-build-test.log 2>&1
  actual=$?
  set -e

  if [[ "$actual" -ne "$expected" ]]; then
    echo "Unexpected result for ref '$ref': expected $expected, got $actual"
    cat /tmp/vercel-ignore-build-test.log
    exit 1
  fi
}

# exit 1 means Vercel must continue the deployment.
run_case "main" 1
run_case "preview/auth-smoke" 1
run_case "release/2026-07" 1
run_case "" 1

# exit 0 means Vercel must ignore the deployment.
run_case "agent/company-brief" 0
run_case "fix/cvm-checkpoint" 0
run_case "docs/runbook" 0

printf 'Vercel deployment budget guard: all cases passed.\n'
