import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/supabase-rest-recovery-probe.yml',import.meta.url),'utf8');

test('Supabase recovery probe is count-only, secret-backed and matrix-isolated',()=>{
  assert.match(workflow,/--probe/);
  assert.match(workflow,/secrets\.SUPABASE_URL/);
  assert.match(workflow,/secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow,/upload-artifact/i);
  assert.doesNotMatch(workflow,/GITHUB_STEP_SUMMARY/i);
  assert.match(workflow,/fail-fast: false/);
  assert.match(workflow,/name: Probe \$\{\{ matrix\.table \}\}/);
  assert.match(workflow,/--tables="\$\{\{ matrix\.table \}\}"/);
  for (const table of [
    'companies','source_catalog','monitoring_outputs','company_signals',
    'qualification_snapshots','company_patterns','score_snapshots',
    'lead_score_snapshots','pipeline'
  ]) assert.match(workflow,new RegExp('\\s+- '+table+'(?:\\n|$)'));
  assert.doesNotMatch(workflow,/continue-on-error:/);
  assert.doesNotMatch(workflow,/Enforce all critical probes/);
});
