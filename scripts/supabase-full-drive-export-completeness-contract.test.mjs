import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/supabase-full-drive-export.yml',import.meta.url),'utf8');

test('full Supabase backup cannot report success when export is partial or empty',()=>{
  assert.match(workflow,/Enforce complete backup/);
  assert.match(workflow,/s\.status === 'ok'/);
  assert.match(workflow,/exportPartsCreated \|\| 0\) > 0/);
  assert.match(workflow,/blockedScopes\.length === 0/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/Upload export artifact/);
});
