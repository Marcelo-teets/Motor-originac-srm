import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/v5-fre-fidc-focused-canary.yml', import.meta.url), 'utf8');

test('canary is one-off, main-only and never a broad scheduled ingestion', () => {
  assert.ok(workflow.includes('branches: [main]'));
  assert.ok(workflow.includes("'.github/workflows/v5-fre-fidc-focused-canary.yml'"));
  assert.ok(!workflow.includes('workflow_dispatch:'));
  assert.ok(!workflow.includes('schedule:'));
  assert.ok(!workflow.includes('--dataset all'));
});

test('canary limits records and reads only approved CVM sets', () => {
  assert.ok(workflow.includes('--dataset cvm_company_fre --max-rows 100'));
  assert.ok(workflow.includes('--dataset cvm_fidc_monthly --max-rows 100'));
  assert.ok(workflow.includes('--requested-rows=100 --trigger=manual'));
  assert.ok(workflow.includes('steps.fre_budget.outputs.effective_rows'));
  assert.ok(workflow.includes('steps.fidc_budget.outputs.effective_rows'));
  assert.ok(workflow.includes('state }}" = "healthy"'));
});

test('canary proves commercially useful identities, not just raw rows', () => {
  assert.ok(workflow.includes("metric_code='employee_count'"));
  assert.ok(workflow.includes("entity_role='assignor'"));
  assert.ok(workflow.includes('No FIDC Tab I assignor CNPJ persisted'));
  assert.ok(workflow.includes('scripts/load-neon-from-vercel.sh'));
});
