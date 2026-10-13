import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const path=new URL('../.github/workflows/v5-cnpjws-single-identity-canary.yml',import.meta.url);
const w=readFileSync(path,'utf8');

test('CNPJws canary cannot run as a scheduled or bulk workflow',()=>{
  assert.ok(w.includes("'.github/workflows/v5-cnpjws-single-identity-canary.yml'"));
  assert.ok(w.includes('branches: [main]'));
  assert.ok(!w.includes('workflow_dispatch:'));
  assert.ok(!w.includes('schedule:'));
  assert.ok(!w.includes('--dataset all'));
  assert.ok(w.includes('--limit 1 --offset 0'));
});
test('canary requires healthy budget, matched CNPJ and no promotion',()=>{
  assert.ok(w.includes('--requested-rows=1 --trigger=manual'));
  assert.ok(w.includes('steps.budget.outputs.state'));
  assert.ok(w.includes("registry_provider='cnpjws_publica_proxy'"));
  assert.ok(w.includes('public.is_valid_cnpj_checksum(cnpj)'));
  assert.ok(w.includes("rows[0].companies !== 2"));
  assert.ok(w.includes("rows[0].candidates !== 50"));
  assert.ok(w.includes("rows[0].guard !== 'normal'"));
});
