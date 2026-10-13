import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const w=readFileSync(new URL('../.github/workflows/v5-cnpj-user-agent-canary.yml',import.meta.url),'utf8');
test('User Agent canary is one shot, checks budget, and cannot promote leads',()=>{
  assert.ok(w.includes('branches: [main]'));
  assert.ok(w.includes('--requested-rows=1 --trigger=manual'));
  assert.ok(w.includes('--limit 1 --offset 0'));
  assert.ok(w.includes('CNPJ_BEFORE'));
  assert.ok(w.includes('x.companies!==2'));
  assert.doesNotMatch(w,/^\s+(?:schedule|workflow_dispatch):/m);
  assert.ok(!w.includes('--dataset all'));
});
