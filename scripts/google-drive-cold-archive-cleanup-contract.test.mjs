import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/google-drive-cold-archive.yml',import.meta.url),'utf8');
const script=readFileSync(new URL('../scripts/google-drive-cold-archive-migrate.mjs',import.meta.url),'utf8');

test('scheduled cold archive deletes staging only after verified Drive migration',()=>{
  assert.match(workflow,/if \[ "\$GITHUB_EVENT_NAME" = 'schedule' \]; then\s+DELETE='true'/m);
  assert.match(workflow,/if \[ "\$GITHUB_EVENT_NAME" = 'push' \]; then[\s\S]*?DELETE='false'/m);
  assert.match(script,/storage_provider=eq\.google_drive/);
  assert.match(script,/migrated_from_bucket/);
  assert.match(script,/migrated_from_path/);
  assert.match(script,/staging_deleted_at/);
  assert.match(script,/sha256_mismatch/);
  assert.match(script,/size_mismatch/);
});

test('newly migrated archive is persisted to Drive before staging deletion',()=>{
  const patchIndex=script.indexOf('await patchPart({ part, file, folderId: runFolder })');
  const deleteIndex=script.indexOf('await deleteStagingObject({ bucket: part.storage_bucket, path: part.storage_path })');
  assert.ok(patchIndex >= 0);
  assert.ok(deleteIndex > patchIndex);
});
