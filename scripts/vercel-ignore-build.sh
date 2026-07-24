#!/usr/bin/env bash

# Secondary defense after git.deploymentEnabled.
#
# Vercel's Ignore Build Step contract is inverted:
# - exit 0: ignore this build
# - exit 1: continue building/deploying
#
# The primary daily-quota protection lives in vercel.json under
# git.deploymentEnabled, because ignored/cancelled builds can still count toward
# deployment quotas. This script keeps the same policy as a defense-in-depth
# check and allows deploys created outside Git (empty ref).

set -u

ref="${VERCEL_GIT_COMMIT_REF:-}"

case "$ref" in
  ""|main|preview/*|release/*)
    echo "Vercel deployment allowed for ref: ${ref:-manual-or-api}"
    exit 1
    ;;
  *)
    echo "Vercel build skipped for ref: $ref"
    echo "Use preview/* for an explicit preview or merge to main for production."
    exit 0
    ;;
esac
