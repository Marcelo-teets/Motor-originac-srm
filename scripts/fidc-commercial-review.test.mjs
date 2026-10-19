import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFidcReviewChecklist, filterFidcReviewItems } from '../frontend/src/lib/fidcCommercialReview.ts';

const sample = (overrides = {}) => ({
  cnpj: '12345678000190',
  legal_name: 'Crédito São João',
  registration_status: 'ATIVA',
  registry_url: 'https://registro.exemplo.br/empresa',
  cvm_evidence_url: 'https://dados.cvm.gov.br/arquivo',
  review_lane: 'business_model_due_diligence',
  recommended_review_action: 'Confirmar modelo de negócio',
  icp_eligibility_status: 'unverified',
  receivables_structurability_status: 'unknown',
  funding_gap_status: 'unknown',
  distinct_funds: 2,
  evidence_links: 3,
  auto_promotion_authorized: false,
  ...overrides,
});

test('FIDC triage searches accents and CNPJ punctuation without modifying inputs', () => {
  const items = Object.freeze([sample(), sample({ cnpj: '00999999000188', legal_name: 'Outro Cedente' })]);
  const byName = filterFidcReviewItems(items, 'credito sao joao', '');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].cnpj, '12345678000190');
  const byCnpj = filterFidcReviewItems(items, '12.345.678/0001-90', '');
  assert.equal(byCnpj.length, 1);
  assert.equal(byCnpj[0].cnpj, '12345678000190');
  assert.equal(items[0].cnpj, '12345678000190');
});

test('FIDC triage isolates human-review lanes and sorts by evidence, not alleged funding fit', () => {
  const rows = [
    sample({ cnpj: '1', evidence_links: 1 }),
    sample({ cnpj: '2', evidence_links: 8 }),
    sample({ cnpj: '3', review_lane: 'regulated_entity_review', evidence_links: 99 }),
    sample({ cnpj: '4', review_lane: 'registry_lookup_pending', evidence_links: 10 }),
  ];
  const all = filterFidcReviewItems(rows, '', '');
  assert.deepEqual(all.map((item) => item.cnpj), ['2', '1', '4', '3']);
  const diligence = filterFidcReviewItems(rows, '', 'business_model_due_diligence');
  assert.deepEqual(diligence.map((item) => item.cnpj), ['2', '1']);
});

test('FIDC review checklist is a non-persistent draft with CVM lineage and unknown fields', () => {
  const content = buildFidcReviewChecklist(sample());
  assert.match(content, /RASCUNHO/);
  assert.match(content, /https:\/\/dados\.cvm\.gov\.br\/arquivo/);
  assert.match(content, /12345678000190/);
  assert.match(content, /Recebíveis estruturáveis: unknown/);
  assert.match(content, /Funding gap: unknown/);
  assert.match(content, /PENDENTE DE REVISÃO HUMANA/);
  assert.match(content, /não altera o banco/);
  assert.doesNotMatch(content, /decisão: aprovada/i);
});
