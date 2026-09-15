import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDealMaster,
  calculateReadiness,
  composeIntroPackage,
  normalizeProduct,
  type DealMasterPayload,
  type EvidenceFact,
} from './originationAiFlow.js';

const companyId = '11111111-1111-4111-8111-111111111111';

const ev = (id: string, fieldKey: string, value: unknown, overrides: Partial<EvidenceFact> = {}): EvidenceFact => ({
  id,
  evidenceKey: `test:${id}`,
  companyId,
  sourceKind: 'manual',
  fieldKey,
  classification: 'fact',
  value,
  confidence: 0.8,
  materiality: 'medium',
  status: 'active',
  effectiveAt: '2026-09-15T12:00:00Z',
  ...overrides,
});

const readyDeal = (): DealMasterPayload => buildDealMaster(companyId, [
  ev('1', 'companyName', 'Empresa Exemplo', { sourceKind: 'company_master' }),
  ev('2', 'context', 'Empresa B2B com carteira recorrente.'),
  ev('3', 'financialNeed', 'Funding para expansão de carteira.', { materiality: 'critical' }),
  ev('4', 'requestedAmount', 50_000_000, { materiality: 'critical' }),
  ev('5', 'timing', 'Q4 2026'),
  ev('6', 'probableProduct', 'FIDC', { classification: 'hypothesis', materiality: 'critical' }),
  ev('7', 'receivables', { type: 'B2B', balance: 80_000_000 }, { materiality: 'critical' }),
  ev('8', 'financials', { revenue: 100_000_000, ebitda: 20_000_000 }),
  ev('9', 'documentation', ['loan-tape.xlsx', 'df-2025.pdf']),
]);

test('critical conflicting values remain disputed and block readiness', () => {
  const deal = buildDealMaster(companyId, [
    ev('1', 'companyName', 'Empresa'),
    ev('2', 'financialNeed', 'Funding de carteira', { materiality: 'critical' }),
    ev('3', 'requestedAmount', 50_000_000, { materiality: 'critical', sourceKind: 'client_email' }),
    ev('4', 'requestedAmount', 30_000_000, { materiality: 'critical', sourceKind: 'meeting_transcript' }),
    ev('5', 'probableProduct', 'FIDC', { classification: 'hypothesis', materiality: 'critical' }),
  ]);
  assert.equal(deal.fields.requestedAmount.status, 'disputed');
  assert.equal(deal.fields.requestedAmount.value, null);
  assert.equal(deal.conflicts[0]?.severity, 'critical');
  const readiness = calculateReadiness(deal);
  assert.equal(readiness.status, 'NOT_READY');
  assert.ok(readiness.hardStops.includes('critical_conflict_open'));
});

test('hypothesis remains hypothesis in canonical Deal Master', () => {
  const deal = buildDealMaster(companyId, [ev('1', 'probableProduct', 'FIDC', { classification: 'hypothesis', materiality: 'critical' })]);
  assert.equal(deal.fields.probableProduct.classification, 'hypothesis');
  assert.equal(deal.probableProduct, 'FIDC');
});

test('source priority selects stronger evidence for noncritical fields', () => {
  const deal = buildDealMaster(companyId, [
    ev('1', 'context', 'Contexto do pipeline', { sourceKind: 'pipeline', confidence: 1 }),
    ev('2', 'context', 'Contexto confirmado por e-mail', { sourceKind: 'client_email', confidence: 0.7 }),
  ]);
  assert.equal(deal.fields.context.value, 'Contexto confirmado por e-mail');
  assert.equal(deal.fields.context.selectedEvidenceId, '2');
  assert.ok(deal.fields.context.evidenceIds.includes('1'));
  assert.ok(deal.fields.context.evidenceIds.includes('2'));
});

test('Deal Master preserves evidence ids for canonical fields', () => {
  const deal = buildDealMaster(companyId, [ev('abc', 'companyName', 'Empresa Exemplo')]);
  assert.deepEqual(deal.fields.companyName.evidenceIds, ['abc']);
});

test('Intro generation refuses NOT_READY deal', () => {
  const deal = readyDeal();
  const readiness = { ...calculateReadiness(deal), status: 'NOT_READY' as const, hardStops: ['manual_test'] };
  assert.throws(() => composeIntroPackage(deal, readiness), /NOT_READY/);
});

test('product change creates critical human-review conflict', () => {
  const previous = readyDeal();
  previous.probableProduct = 'DEBENTURE';
  const deal = buildDealMaster(companyId, [
    ev('1', 'companyName', 'Empresa Exemplo'),
    ev('2', 'probableProduct', 'FIDC', { classification: 'hypothesis', materiality: 'critical' }),
  ], previous);
  const conflict = deal.conflicts.find((item) => item.conflictType === 'product_change');
  assert.equal(conflict?.severity, 'critical');
  assert.equal(conflict?.humanReviewRequired, true);
});

test('READY_WITH_CAVEATS carries missing checks as caveats', () => {
  const deal = readyDeal();
  delete deal.fields.financials;
  delete deal.fields.documentation;
  const readiness = calculateReadiness(deal);
  assert.equal(readiness.status, 'READY_WITH_CAVEATS');
  assert.ok(readiness.caveats.length >= 2);
});

test('product normalization rejects products outside SRM scope', () => {
  assert.equal(normalizeProduct('Debênture Incentivada'), 'DEBENTURE_INCENTIVADA');
  assert.equal(normalizeProduct('Nota Comercial'), 'UNDEFINED');
  assert.equal(normalizeProduct('CCB'), 'UNDEFINED');
});
