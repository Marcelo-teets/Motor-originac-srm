import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const w=readFileSync(new URL('../.github/workflows/v5-fidc-registry-twenty-canary.yml',import.meta.url),'utf8');
test('CVM FIDC registry batch has hard twenty-record limit and no schedule',()=>{
 assert.ok(w.includes('branches: [main]'));
 assert.ok(w.includes("'.github/workflows/v5-fidc-registry-twenty-canary.yml'"));
 assert.ok(!w.includes('schedule:'));
 assert.ok(!w.includes('workflow_dispatch:'));
 assert.ok(w.includes('--limit 20 --offset 0'));
 assert.ok(w.includes('--requested-rows=20 --trigger=manual'));
 assert.ok(w.includes('steps.budget.outputs.effective_rows'));
});
test('CNPJ registry enrichment cannot promote companies or bypass source proof',()=>{
 assert.ok(w.includes('cnpjws_publica_proxy'));
 assert.ok(w.includes('public.is_valid_cnpj_checksum(cnpj)'));
 assert.ok(w.includes("x.companies!==2 || x.candidates!==50"));
 assert.ok(w.includes("x.guard!=='normal'"));
 assert.ok(!w.includes('--dataset all'));
});
