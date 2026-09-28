import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/supabase-rest-recovery-probe.yml',import.meta.url),'utf8');

test('Supabase recovery probe is count-only and secret-backed',()=>{
  assert.match(workflow,/--probe/);
  assert.match(workflow,/secrets\.SUPABASE_URL/);
  assert.match(workflow,/secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow,/upload-artifact/i);
  assert.doesNotMatch(workflow,/supabase-rest-export\.mjs\s+--out=.*(?<!--probe)/i);
  assert.match(workflow,/companies,source_catalog,monitoring_outputs,company_signals/);
});
