import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const w=readFileSync(new URL('../.github/workflows/v5-fidc-registry-ten-to-fifty.yml',import.meta.url),'utf8');
test('M1 final ten-CNPJ cloud canary is bounded and one-shot',()=>{
 assert.ok(w.includes("'.github/workflows/v5-fidc-registry-ten-to-fifty.yml'"));
 assert.ok(w.includes('branches: [main]'));
 assert.ok(w.includes('--limit 10 --offset 0'));
 assert.ok(w.includes('--requested-rows=10 --trigger=manual'));
 assert.ok(!w.includes('workflow_dispatch:'));
 assert.ok(!w.includes('schedule:'));
 assert.ok(!w.includes('--dataset all'));
});
test('M1 gate needs at least 50 proven identities with no promotion',()=>{
 assert.ok(w.includes('x.verified_names<50'));
 assert.ok(w.includes('x.corroborated_cnpjws<30'));
 assert.ok(w.includes('public.is_valid_cnpj_checksum(cnpj)'));
 assert.ok(w.includes('x.companies!==2 || x.candidates!==50'));
 assert.ok(w.includes("x.guard!=='normal'"));
});
