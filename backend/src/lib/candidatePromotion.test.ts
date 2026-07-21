import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateDraftToCompanySeed, deterministicCompanyUuid, type DiscoveredCandidateDraft } from './candidatePromotion.js';

const candidate = (overrides: Partial<DiscoveredCandidateDraft> = {}): DiscoveredCandidateDraft => ({
  companyName: 'Originadora Exemplo S.A.',
  legalName: 'Originadora Exemplo S.A.',
  cnpj: '12.345.678/0001-90',
  geography: 'Brasil',
  segment: 'Crédito e Recebíveis',
  subsegment: 'FIDC',
  companyType: 'Emissor / Originador',
  creditProduct: 'Carteira ou recebíveis — validar originador e lastro',
  targetStructure: 'FIDC',
  sourceRef: 'capital_market_event:test',
  sourceUrl: 'https://dados.cvm.gov.br/test',
  evidenceSummary: 'Registro oficial CVM.',
  receivables: ['FIDC identificado em registro CVM — validar carteira, originador e lastro'],
  confidence: 0.98,
  dedupeKey: 'cvm:issuer:12345678000190',
  rawPayload: { origin: 'cvm_capital_market_event' },
  ...overrides,
});

test('deterministicCompanyUuid returns a stable RFC-compatible UUID', () => {
  const first = deterministicCompanyUuid(candidate());
  const second = deterministicCompanyUuid(candidate({ companyName: 'Outro nome para o mesmo CNPJ' }));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, second);
});

test('deterministicCompanyUuid changes when the canonical identity changes', () => {
  assert.notEqual(
    deterministicCompanyUuid(candidate()),
    deterministicCompanyUuid(candidate({ cnpj: '98.765.432/0001-10' })),
  );
});

test('CVM candidate becomes a UUID company seed with regulatory signal lineage', () => {
  const seed = candidateDraftToCompanySeed(candidate());
  assert.match(seed.id, /^[0-9a-f-]{36}$/);
  assert.equal(seed.cnpj, '12345678000190');
  assert.deepEqual(seed.receivables, ['FIDC identificado em registro CVM — validar carteira, originador e lastro']);
  assert.equal(seed.signals[0].type, 'captured_from_capital_market_event');
  assert.equal(seed.stage, 'Identified');
});
