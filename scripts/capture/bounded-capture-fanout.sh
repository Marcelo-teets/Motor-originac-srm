#!/usr/bin/env bash
set -euo pipefail

: "${CAPTURE_TOKEN:?capture token is missing}"
: "${TARGETS_URL:?targets url is missing}"
: "${CAPTURE_URL:?capture url is missing}"
MAX_PARALLELISM="${MAX_PARALLELISM:-3}"
CAPTURE_CADENCE="${CAPTURE_CADENCE:-all}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/null}"

separator='?'
if [[ "$TARGETS_URL" == *'?'* ]]; then separator='&'; fi
TARGETS_REQUEST_URL="${TARGETS_URL}${separator}cadence=${CAPTURE_CADENCE}"

http_code="$(curl --silent --show-error \
  --output targets.json \
  --write-out '%{http_code}' \
  --max-time 25 \
  --header "Authorization: Bearer ${CAPTURE_TOKEN}" \
  "${TARGETS_REQUEST_URL}")"
if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
  echo "Target discovery failed with HTTP $http_code" >&2
  cat targets.json >&2
  exit 1
fi
jq -e '.data.policy.boundedScopeRequired == true' targets.json >/dev/null
jq -e --arg cadence "$CAPTURE_CADENCE" '.data.policy.cadence == $cadence' targets.json >/dev/null
jq -r '.data.targets[] | [.companyId, .sourceId, .companyName, .sourceName] | @tsv' targets.json > capture-targets.tsv
{
  echo "cadence=$CAPTURE_CADENCE"
  echo "companies=$(jq -r '.data.counts.companies' targets.json)"
  echo "sources=$(jq -r '.data.counts.sources' targets.json)"
  echo "targets=$(jq -r '.data.counts.targets' targets.json)"
} >> "$SUMMARY_FILE"

mkdir -p capture-results
if [[ ! -s capture-targets.tsv ]]; then
  echo "No monitoring-eligible capture targets for cadence $CAPTURE_CADENCE." >> "$SUMMARY_FILE"
  exit 0
fi

capture_pair() {
  local company_id="$1"
  local source_id="$2"
  local company_name="$3"
  local source_name="$4"
  local key body_file status_file http_code curl_exit
  key="$(printf '%s|%s' "$company_id" "$source_id" | sha256sum | cut -d' ' -f1)"
  body_file="capture-results/${key}.json"
  status_file="capture-results/${key}.status"
  set +e
  http_code="$(curl --silent --show-error \
    --output "$body_file" \
    --write-out '%{http_code}' \
    --max-time 29 \
    --request POST \
    --header "Authorization: Bearer ${CAPTURE_TOKEN}" \
    "${CAPTURE_URL}?companyId=${company_id}&sourceId=${source_id}")"
  curl_exit=$?
  set -e
  if [[ $curl_exit -eq 0 && "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    printf 'success\t%s\t%s\t%s\n' "$company_name" "$source_name" "$http_code" > "$status_file"
  else
    printf 'failure\t%s\t%s\t%s\n' "$company_name" "$source_name" "${http_code:-000}" > "$status_file"
  fi
}
export -f capture_pair
export CAPTURE_TOKEN CAPTURE_URL
xargs -P "$MAX_PARALLELISM" -L 1 -d '\n' bash -c '
  IFS=$'"'"'\t'"'"' read -r company_id source_id company_name source_name <<< "$1"
  capture_pair "$company_id" "$source_id" "$company_name" "$source_name"
' _ < capture-targets.tsv

cat capture-results/*.status | sort > capture-summary.tsv
total="$(wc -l < capture-summary.tsv | tr -d ' ')"
failures="$(awk -F '\t' '$1 == "failure" {count++} END {print count+0}' capture-summary.tsv)"
successes="$((total - failures))"
{
  echo "successes=$successes"
  echo "failures=$failures"
  echo ''
  echo '| status | company | source | http |'
  echo '|---|---|---|---:|'
  awk -F '\t' '{printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4}' capture-summary.tsv
} >> "$SUMMARY_FILE"
if [[ "$failures" -gt 0 ]]; then
  echo "$failures bounded capture target(s) failed; inspect audited source_connector_runs." >&2
  exit 1
fi
