import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../db/migrations/139_origination_intelligence_brief.sql', import.meta.url), 'utf8');

test('origination brief migration preserves observed vs recommended semantics', () => {
  assert.match(sql, /signal_type[\s\S]*'origination_brief'/);
  assert.match(sql, /'recommended'/);
  assert.match(sql, /company_origination_brief_v1/);
  assert.match(sql, /why_credit/);
  assert.match(sql, /why_now/);
  assert.match(sql, /commercial_angle/);
  assert.match(sql, /next_action/);
});

test('hiring guard requires explicit vacancy evidence and preserves raw monitoring', () => {
  assert.match(sql, /is_trusted_hiring_signal_evidence_v1/);
  assert.match(sql, /vaga\(s\)\?/);
  assert.match(sql, /job posting/);
  assert.match(sql, /Raw monitoring evidence remains untouched/);
});

test('commercial handoff does not overwrite a human next action', () => {
  assert.match(sql, /Never overwrite a human next action/);
  assert.match(sql, /executar análise comercial/);
  assert.match(sql, /definir próximo passo comercial/);
});
