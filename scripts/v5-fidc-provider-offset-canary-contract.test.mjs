import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const s=readFileSync(new URL('../.github/workflows/v5-fidc-provider-offset-canary.yml',import.meta.url),'utf8');
test('three-offset FIDC lookup canary stays narrow and one-shot',()=>{
  assert.ok(s.includes("branches: [main]"));
  assert.ok(s.includes("--requested-rows=3 --trigger=manual"));
  assert.equal((s.match(/--limit 1 --offset /g)||[]).length,3);
  for(const n of [20,40,60])assert.ok(s.includes("--limit 1 --offset "+n));
  assert.doesNotMatch(s,/^\s+(schedule|workflow_dispatch):/m);
  assert.ok(!s.includes('--dataset all'));
  assert.ok(s.includes("x.cvm_cnpjs!==85"));
});
