import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/v5-fidc-40-registry-identity-batches.yml', import.meta.url),'utf8');

test('CNPJ enrichment runs only on reviewed one-shot main workflow and not schedule',()=>{
  assert.ok(workflow.includes('branches: [main]'));
  assert.ok(workflow.includes("'.github/workflows/v5-fidc-40-registry-identity-batches.yml'"));
  assert.doesNotMatch(workflow,/^\s+(?:schedule|workflow_dispatch):/m);
  assert.ok(!workflow.includes('--dataset all'));
});
test('requires independent budget and at most 20 company lookups per batch',()=>{
  assert.equal((workflow.match(/--limit 20/g)??[]).length,2);
  assert.equal((workflow.match(/--requested-rows=20 --trigger=manual/g)??[]).length,2);
  assert.ok(workflow.includes('steps.first_budget.outputs.blocked'));
  assert.ok(workflow.includes('steps.second_budget.outputs.blocked'));
  assert.ok(workflow.includes('registry_count-base>40'));
});
test('requires 50 corroborated CNPJs, exact provider and no candidate/company promotion',()=>{
  assert.ok(workflow.includes('registry_count<50'));
  assert.ok(workflow.includes('invalid_provenance'));
  assert.ok(workflow.includes('COMPANIES_BASELINE'));
  assert.ok(workflow.includes('CANDIDATES_BASELINE'));
  assert.ok(workflow.includes('status from private.database_growth_guard_state'));
  assert.doesNotMatch(workflow,/\b(?:delete from|truncate table|drop table|insert into companies|approve_candidate_identity_review)\b/i);
});
