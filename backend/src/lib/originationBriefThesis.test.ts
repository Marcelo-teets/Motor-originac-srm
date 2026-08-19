import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThesisOutput } from './thesis.js';
import type { CompanySeed, QualificationSnapshot } from '../types/platform.js';

const qualification = {
  suggested_structure_type: 'FIDC / cessão de recebíveis',
  fit_fidc: true,
  confidence_score: 0.84,
  evidence_payload: {},
} as QualificationSnapshot;

const baseCompany = {
  tradeName: 'Empresa Teste',
  creditProduct: 'Crédito B2B',
  receivables: ['duplicatas'],
  signals: [],
} as unknown as CompanySeed;

test('thesis prioritizes the deterministic origination brief when available', () => {
  const note = 'Headcount cresceu 23%. Padrão provável: Expansion outpacing capital structure. Estrutura sugerida: FIDC. Ângulo comercial: financiar crescimento. Próxima ação: mapear funding atual.';
  const result = buildThesisOutput({
    ...baseCompany,
    signals: [{ type: 'origination_brief', strength: 88, confidence: 0.9, note, source: 'derived' }],
  }, qualification, []);

  assert.match(result.summary, /Headcount cresceu 23%/);
  assert.match(result.summary, /Próxima ação: mapear funding atual/);
  assert.match(result.marketMapSummary, /Origination Intelligence integrada/);
  assert.equal(result.structureType, 'FIDC / cessão de recebíveis');
});

test('thesis preserves the existing evidence-based fallback without an origination brief', () => {
  const result = buildThesisOutput(baseCompany, qualification, []);
  assert.match(result.summary, /Empresa Teste/);
  assert.match(result.summary, /duplicatas/);
  assert.doesNotMatch(result.summary, /Próxima ação:/);
});
