import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateDraftToCompanySeed, discoveryHitToCandidateDraft, deterministicCompanyUuid, type DiscoveredCandidateDraft } from './candidatePromotion.js';
import type { SearchProfile } from '../types/platform.js';

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

test('VC portfolio listing does not verify profile-derived credit, receivables, legal name or Brazil location',()=>{
  const profile = {
    id:'profile', geography:'Brasil', segment:'Fintech',
    subsegment:'Embedded Finance, Payments',
    companyType:'Tech-based',
    creditProduct:'crédito recebíveis antecipação',
    targetStructure:'FIDC', receivables:['carteira de crédito'],
  } as SearchProfile;
  const result = discoveryHitToCandidateDraft(profile,{
    companyName:'Camino Education',
    sourceRef:'vc-portfolio:kaszek',
    sourceUrl:'https://www.kaszek.com/companies',
    evidenceSummary:'Listada no portfólio; verificar identidade',
    confidence:0.55,
    rawPayload:{origin:'vc_portfolio_page'},
  });
  assert.equal(result.companyName,'Camino Education');
  assert.equal(result.legalName,undefined);
  assert.equal(result.segment,'Unverified');
  assert.equal(result.subsegment,'Unverified');
  assert.equal(result.creditProduct,'Unknown');
  assert.equal(result.geography,'Unverified');
  assert.deepEqual(result.receivables,[]);
  assert.equal(result.rawPayload.profileAttributeVerification,'unverified_portfolio_only');
  assert.equal((result.rawPayload.searchProfileHypothesis as {creditProduct:string}).creditProduct,'crédito recebíveis antecipação');
  assert.equal(result.sourceUrl,'https://www.kaszek.com/companies');
});

test('regulatory evidence for debt instrument is not accidentally erased by VC-only protection',()=>{
  const profile = {
    id:'profile', geography:'Brasil', segment:'Middle Market / DCM',
    subsegment:'DEBENTURE', companyType:'Emissor corporativo',
    creditProduct:'Unknown', targetStructure:'DCM', receivables:[],
  } as SearchProfile;
  const result = discoveryHitToCandidateDraft(profile,{
    companyName:'Companhia Teste S.A.',cnpj:'12.345.678/0001-90',
    sourceRef:'cvm_capital_market_event:2026',
    evidenceSummary:'Registro CVM de emissão',confidence:0.95,rawPayload:{origin:'cvm_capital_market_event'},
  });
  assert.equal(result.segment,'Middle Market / DCM');
  assert.equal(result.geography,'Brasil');
  assert.equal(result.rawPayload.profileAttributeVerification,undefined);
});
