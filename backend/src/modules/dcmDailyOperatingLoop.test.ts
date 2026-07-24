import assert from 'node:assert/strict';
import test from 'node:test';
import {
  businessAnalystAgent,
  dailyDcmLeadWorkflow,
  dailyLeadOutputContract,
  outreachWritingRules,
} from './dcmDailyOperatingLoop.js';

test('daily DCM workflow covers all six operational stages', () => {
  assert.deepEqual(dailyDcmLeadWorkflow.stages.map((stage) => stage.id), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(dailyDcmLeadWorkflow.stages.at(-1)?.name, 'Aprendizado de escrita');
});

test('outreach contract supports governed execution states', () => {
  assert.ok(dailyLeadOutputContract.statuses.includes('ready'));
  assert.ok(dailyLeadOutputContract.statuses.includes('sent'));
  assert.ok(dailyLeadOutputContract.statuses.includes('missing_data'));
  assert.deepEqual(dailyLeadOutputContract.deduplicationKeys, ['company_id', 'linkedin_url', 'generated_on']);
});

test('writing guardrails block commercial overpromising', () => {
  const rules = outreachWritingRules.join(' ').toLowerCase();
  assert.match(rules, /uma hipótese de produto/);
  assert.match(rules, /não prometer preço, taxa, prazo, volume, aprovação ou fechamento/);
  assert.match(rules, /observação concreta/);
});

test('business analyst remains documentary and read-only', () => {
  assert.equal(businessAnalystAgent.mode, 'read-only');
  assert.ok(businessAnalystAgent.outputs.includes('intake estruturado'));
  assert.ok(businessAnalystAgent.limits.includes('sem alteração de produção'));
});
