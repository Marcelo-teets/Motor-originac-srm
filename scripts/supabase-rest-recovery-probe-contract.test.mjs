import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/supabase-rest-recovery-probe.yml',import.meta.url),'utf8');

test('Supabase recovery probe is count-only, secret-backed and table-isolated',()=>{
  assert.match(workflow,/--probe/);
  assert.match(workflow,/secrets\.SUPABASE_URL/);
  assert.match(workflow,/secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow,/upload-artifact/i);
  assert.doesNotMatch(workflow,/GITHUB_STEP_SUMMARY/i);
  for (const table of [
    'companies','source_catalog','monitoring_outputs','company_signals',
    'qualification_snapshots','company_patterns','score_snapshots',
    'lead_score_snapshots','pipeline'
  ]) {
    assert.match(workflow,new RegExp('Probe '+table.replaceAll('_','_')));
    assert.match(workflow,new RegExp('--tables='+table));
  }
  assert.match(workflow,/continue-on-error: true/);
  assert.match(workflow,/Enforce all critical probes/);
});
