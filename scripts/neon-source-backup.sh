#!/usr/bin/env bash
# Manual, READ-ONLY source recovery. Secrets remain in GitHub Actions.
set -euo pipefail
set +x
umask 077

test "${ACK:-}" = BACKUP_READ_ONLY || { echo 'Expected explicit BACKUP_READ_ONLY confirmation'; exit 1; }
case "${MODE:-}" in backup_full|backup_public_only) ;; *) echo 'Invalid backup mode'; exit 1;; esac
missing=()
for name in SOURCE_DATABASE_URL BACKUP_PASSPHRASE GOOGLE_DRIVE_CLIENT_ID GOOGLE_DRIVE_CLIENT_SECRET GOOGLE_DRIVE_REFRESH_TOKEN; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing secret name: %s\n' "${missing[@]}"
  exit 1
fi
test "${#BACKUP_PASSPHRASE}" -ge 32 || { echo 'BACKUP_PASSPHRASE needs at least 32 characters'; exit 1; }

# Ensure credentials point to the authorized SOURCE, not an unrelated database.
node --input-type=module <<'NODE'
const uri=new URL(process.env.SOURCE_DATABASE_URL);
const ref='hdghpmssudrqhsbvrdyt';
const direct=uri.hostname==='db.'+ref+'.supabase.co';
const pooler=uri.hostname.endsWith('.pooler.supabase.com') &&
  decodeURIComponent(uri.username)==='postgres.'+ref;
if(!['postgres:','postgresql:'].includes(uri.protocol)||(!direct&&!pooler))
  throw Error('Connection URL does not identify the authorized Motor source project');
if(uri.searchParams.get('sslmode')==='disable')
  throw Error('Unencrypted connection is not allowed');
console.log('Authorized Supabase source URI structure verified; secrets not logged');
NODE

tmp_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/motor-private-backup-XXXXXXXX")"
# The ephemeral runner must never leave plaintext data available after this step.
trap 'rm -rf "$tmp_dir"' EXIT
docker pull postgres:17-alpine >/dev/null
scope=full
pg_args=()
if [ "$MODE" = backup_public_only ]; then
  scope=public-only
  pg_args+=(--schema=public)
fi
echo "Exporting source read-only to an ephemeral runner, scope=$scope"
docker run --rm \
  --env SOURCE_DATABASE_URL --env PGCONNECT_TIMEOUT --env PGSSLMODE \
  -v "$tmp_dir:/backup" postgres:17-alpine \
  pg_dump "$SOURCE_DATABASE_URL" --format=custom --compress=6 \
  --no-owner --no-acl --lock-wait-timeout=5000 \
  "${pg_args[@]}" --file=/backup/source.dump
test -s "$tmp_dir/source.dump" || { echo 'Database dump missing or empty'; exit 1; }

# Encrypt before sending anything outside this ephemeral private runner.
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-fd 0 --symmetric --cipher-algo AES256 \
  --output "$tmp_dir/source.dump.gpg" "$tmp_dir/source.dump"
test -s "$tmp_dir/source.dump.gpg"
cipher_md5="$(md5sum "$tmp_dir/source.dump.gpg" | cut -d' ' -f1)"
rm -f "$tmp_dir/source.dump"

token_response="$(curl --fail-with-body --silent --show-error --max-time 30 \
  --request POST 'https://oauth2.googleapis.com/token' \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "client_id=$GOOGLE_DRIVE_CLIENT_ID" \
  --data-urlencode "client_secret=$GOOGLE_DRIVE_CLIENT_SECRET" \
  --data-urlencode "refresh_token=$GOOGLE_DRIVE_REFRESH_TOKEN" \
  --data-urlencode 'grant_type=refresh_token')"
access_token="$(printf '%s' "$token_response" | jq -er '.access_token')"
unset token_response

# Do not upload ANY dump as a public GitHub artifact. Private Drive is the only destination.
upload="$(curl --fail-with-body --silent --show-error --retry 2 --max-time 3600 \
  -H "Authorization: Bearer $access_token" \
  -H 'content-type: application/octet-stream' \
  --data-binary @"$tmp_dir/source.dump.gpg" \
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=media&fields=id,size,md5Checksum')"
file_id="$(printf '%s' "$upload" | jq -er '.id')"
if [[ ! "$file_id" =~ ^[A-Za-z0-9_-]{10,}$ ]]; then echo 'Invalid Drive file ID'; exit 1; fi
name="motor-supabase-${scope}-${GITHUB_RUN_ID:-manual}.dump.gpg"
moved="$(curl --fail-with-body --silent --show-error --retry 2 --max-time 30 \
  --request PATCH \
  -H "Authorization: Bearer $access_token" \
  -H 'content-type: application/json' \
  --data "{\"name\":\"$name\"}" \
  "https://www.googleapis.com/drive/v3/files/$file_id?addParents=$GOOGLE_DRIVE_ARCHIVE_FOLDER_ID&fields=id,name,parents,md5Checksum,size")"
remote_md5="$(printf '%s' "$moved" | jq -er '.md5Checksum')"
in_folder="$(printf '%s' "$moved" | jq -er --arg p "$GOOGLE_DRIVE_ARCHIVE_FOLDER_ID" '.parents|index($p)!=null')"
test "$in_folder" = true
test "$cipher_md5" = "$remote_md5" || { echo 'ENCRYPTED FILE CHECKSUM MISMATCH'; exit 1; }
unset access_token

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo '## Verified encrypted, private Drive backup'
    echo "- Scope: $scope"
    echo "- Drive file ID: $file_id"
    echo '- AES256-encrypted backup uploaded; encrypted MD5 verified on provider'
    echo '- No SQL data or connection string was logged or committed'
    echo '- This is NOT evidence of restored Neon data or working Auth/Storage'
    if [ "$scope" = public-only ]; then
      echo 'WARNING: Public-only backup omits Supabase Auth and all other managed schemas'
    else
      echo 'WARNING: Full SQL dump omits actual Supabase Storage object bytes'
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi
echo 'Encrypted export complete; Neon production remains unchanged'
