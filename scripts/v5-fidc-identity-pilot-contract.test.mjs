import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/v5-fidc-registry-identity-pilot.yml', import.meta.url), 'utf8');

test('pilot is once-only on main with no scheduled or broad ingestion', () => {
  assert.ok(workflow.includes('branches: [main]'));
  assert.ok(workflow.includes("'.github/workflows/v5-fidc-registry-identity-pilot.yml'"));
  assert.ok(!workflow.includes('workflow_dispatch:'));
  assert.ok(!workflow.includes('schedule:'));
  assert.ok(!workflow.includes('--dataset all'));
});
test('pilot requires healthy Neon guard and CNPJ registration proof', () => {
  assert.ok(workflow.includes('--requested-rows=10 --trigger=manual'));
  assert.ok(workflow.includes('steps.budget.outputs.blocked'));
  assert.ok(workflow.includes('--limit 10'));
  assert.ok(workflow.includes('fidc_assignor_registry_identities'));
  assert.ok(workflow.includes("registry_identity_review_required"));
  assert.ok(workflow.includes('scripts/load-neon-from-vercel.sh'));
  assert.ok(workflow.includes('Registry returned no corroborated identity'));
});
test('pilot never promotes, deletes or scores companies', () => {
  assert.doesNotMatch(workflow, /\b(?:delete from|truncate|drop table|auto_resolve_verified_candidate_entities_v4|approve_candidate_identity_review|insert into public.companies)\b/i);
});
