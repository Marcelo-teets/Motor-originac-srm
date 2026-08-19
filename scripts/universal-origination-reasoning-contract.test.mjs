import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../db/migrations/141_universal_origination_reasoning_v2.sql', import.meta.url), 'utf8');
const calibration = readFileSync(new URL('../db/migrations/142_universal_origination_reasoning_calibration.sql', import.meta.url), 'utf8');

test('universal reasoning maps the major origination signal families', () => {
  for (const token of [
    'funding_gap_signal',
    'dcm_fit_signal',
    'fidc_fit_signal',
    'receivables',
    'credit_product',
    'capital_mismatch',
    'market_signal',
    'technical_product',
    'risk_validation_signal',
    'vc_portfolio',
    'media_funding_event',
    'macro',
    'fidc_maturity',
    'capital_market_refinancing_window',
    'regulatory_event',
    'headcount',
    'hiring',
  ]) {
    assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('reasoning is grounded in signals, Factor Map and Qualification', () => {
  assert.match(migration, /company_signals/);
  assert.match(migration, /company_factor_observations/);
  assert.match(migration, /origination_factor_catalog/);
  assert.match(migration, /qualification_snapshots/);
  assert.match(migration, /company_origination_reasoning_evidence_v2/);
  assert.match(migration, /company_origination_reasoning_v2/);
  assert.match(migration, /company_origination_brief_v2/);
});

test('reasoning has the required decision chain and provenance semantics', () => {
  for (const token of [
    'financialImplication',
    'patternHint',
    'structureHint',
    'validationQuestion',
    'nextAction',
    'guardrail',
    'observed',
    'inferred',
    'contextual',
    'reasoningDimensions',
    'missingEvidence',
    'risksToValidate',
  ]) assert.match(migration, new RegExp(token));
});

test('coverage fails closed for unmapped live signal types', () => {
  assert.match(migration, /origination_reasoning_coverage_v2/);
  assert.match(migration, /raise exception 'Universal Origination Reasoning v2 has unmapped live signal types/);
  assert.match(migration, /Sinal não mapeado não pode alterar tese, score, estrutura ou prioridade/);
});

test('guardrails prevent common false origination conclusions', () => {
  assert.match(migration, /Fit FIDC e contexto de mercado não provam necessidade de capital/);
  assert.match(migration, /Acesso ou funding existente comprova executabilidade; não prova funding gap atual/);
  assert.match(migration, /equity recente não implica dívida/i);
  assert.match(migration, /Contexto de mercado ou macro nunca deve criar funding need sozinho/);
  assert.match(migration, /Hiring mede intenção\/readiness/);
  assert.match(migration, /Risco pode aumentar urgência e simultaneamente reduzir executabilidade/);
});

test('universal reasoning enriches execution without double-counting score', () => {
  assert.match(migration, /Score-neutral by design/);
  assert.doesNotMatch(migration, /new\.lead_score\s*:=/);
  assert.match(migration, /new\.next_action\s*:=/);
  assert.match(migration, /new\.commercial_angle\s*:=/);
  assert.match(migration, /new\.suggested_structure\s*:=/);
});

test('human pipeline actions and real-company gate remain preserved', () => {
  assert.match(migration, /is_company_origination_brief_eligible_v1/);
  assert.match(migration, /executar análise comercial/);
  assert.match(migration, /definir próximo passo comercial/);
  assert.match(migration, /Re-materialize only real\/non-synthetic Company Master rows/);
});

test('all non-context mapped signals refresh the canonical brief automatically', () => {
  assert.match(migration, /v_dimension='context'/);
  assert.match(migration, /perform public\.refresh_company_origination_brief_v1\(v_company_id\)/);
  assert.match(migration, /Existing qualification\/pattern\/job\/metric\/investor triggers from v1/);
});

test('calibration keeps generic risk validation contextual and Factor Map current', () => {
  assert.match(calibration, /signal_type='risk_validation_signal' then 'context'/);
  assert.match(calibration, /signal_type='risk_validation_signal' then 'contextual'/);
  assert.match(calibration, /latest_factor as/);
  assert.match(calibration, /distinct on \(f\.company_id,f\.factor_id\)/);
  assert.match(calibration, /interval '365 days'/);
  assert.match(calibration, /Hipótese analítica do Factor Map/);
  assert.match(calibration, /from top_rows/);
});
