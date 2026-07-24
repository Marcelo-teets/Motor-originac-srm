#!/usr/bin/env bash

# Vercel's Ignore Build Step contract is inverted:
# - exit 0: ignore this deployment
# - exit 1: continue building/deploying
#
# Automatic production remains tied to main. Preview capacity is opt-in through
# preview/* and release/* branches. Deployments created outside Git (empty ref)
# remain allowed so CLI/API recovery paths are not blocked.

set -u

ref="${VERCEL_GIT_COMMIT_REF:-}"

case "$ref" in
  ""|main|preview/*|release/*)
    echo "Vercel deployment allowed for ref: ${ref:-manual-or-api}"
    exit 1
    ;;
  *)
    echo "Vercel deployment skipped for ref: $ref"
    echo "Use preview/* for an explicit preview or merge to main for production."
    exit 0
    ;;
esac
