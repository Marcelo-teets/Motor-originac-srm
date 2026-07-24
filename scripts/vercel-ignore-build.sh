#!/usr/bin/env bash
set -euo pipefail

# Vercel semantics:
#   exit 0 -> ignore this deployment
#   exit 1 -> continue building
#
# Keep the decision conservative. Any file that can change the frontend,
# Node functions, their imported backend modules or build configuration must build.

if [[ -n "${VERCEL_CHANGED_FILES:-}" ]]; then
  changed_files="$VERCEL_CHANGED_FILES"
else
  if [[ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ]] && git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
    changed_files="$(git diff --name-only "${VERCEL_GIT_PREVIOUS_SHA}" HEAD)"
  elif git rev-parse --verify HEAD^ >/dev/null 2>&1; then
    changed_files="$(git diff --name-only HEAD^ HEAD)"
  else
    echo "[vercel-ignore] Previous commit unavailable; building conservatively."
    exit 1
  fi
fi

if [[ -z "${changed_files//[[:space:]]/}" ]]; then
  echo "[vercel-ignore] No changed files detected; ignoring deployment."
  exit 0
fi

build_pattern='^(frontend/|api/|backend/|config/|package\.json$|package-lock\.json$|tsconfig(\.[^/]+)?\.json$|vercel\.json$|\.npmrc$|scripts/vercel-ignore-build\.sh$)'

if printf '%s\n' "$changed_files" | grep -Eq "$build_pattern"; then
  echo "[vercel-ignore] Runtime-impacting change detected; continuing build."
  printf '%s\n' "$changed_files" | grep -E "$build_pattern" || true
  exit 1
fi

echo "[vercel-ignore] Changes do not affect the Vercel artifact; ignoring deployment."
printf '%s\n' "$changed_files"
exit 0
