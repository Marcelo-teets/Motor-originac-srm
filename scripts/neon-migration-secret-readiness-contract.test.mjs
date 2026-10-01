import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/neon-migration-secret-readiness.yml',import.meta.url),'utf8');

test('migration secret readiness reveals presence only, never values',()=>{
  for (const name of [
    'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','MOTOR_SUPABASE_DATABASE_URL',
    'MOTOR_NEON_DATABASE_URL','MOTOR_BACKUP_PASSPHRASE','NEON_API_KEY'
  ]) assert.match(workflow,new RegExp('secrets\\.'+name));
  assert.doesNotMatch(workflow,/echo\s+["']?\$VALUE/i);
  assert.doesNotMatch(workflow,/printenv/i);
  assert.doesNotMatch(workflow,/env\s*\|/i);
  assert.doesNotMatch(workflow,/upload-artifact/i);
});
