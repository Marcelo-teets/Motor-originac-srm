import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidatePromotionBlockedError, assertCandidatePromotionReady, evaluateCandidatePromotionReadiness, isValidCnpjChecksum } from './candidatePromotionReadiness.js';
import type { CandidatePromotionCandidate } from './candidatePromotionReadiness.js';

const candidate = (patch: Partial<CandidatePromotionCandidate> = {}): CandidatePromotionCandidate => ({
  companyName: 'Empresa Real',
  legalName: 'Empresa Real Ltda.',
  website: 'https://empresa-real.com.br',
  normalizedDomain: 'empresa-real.com.br',
  cnpj: '11444777000161',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Crédito',
  companyType: 'Middle Market',
  creditProduct: 'Antecipação',
  targetStructure: 'FIDC',
  sourceRef: 'official_company_site',
  sourceUrl: 'https://empresa-real.com.br',
  evidenceSummary: 'Identidade jurídica confirmada em fonte oficial e domínio corporativo reconciliado com o CNPJ.',
  receivables: [],
  confidence: 0.92,
  dedupeKey: 'cnpj:11444777000161',
  rawPayload: {
    identity_evidence_url: 'https://empresa-real.com.br/termos',
    legal_name_verified: true,
    identity_review_status: 'approved',
  },
  candidateStatus: 'captured',
  companyId: '11111111-1111-4111-8111-111111111111',
  ...patch,
});

test('validates CNPJ checksum', () => {
  assert.equal(isValidCnpjChecksum('11.444.777/0001-61'), true);
  assert.equal(isValidCnpjChecksum('11.444.777/0001-62'), false);
  assert.equal(isValidCnpjChecksum('00.000.000/0000-00'), false);
});

test('blocks name-only portfolio candidates', () => {
  const result = evaluateCandidatePromotionReadiness(candidate({
    cnpj: undefined,
    website: undefined,
    normalizedDomain: undefined,
    confidence: 0.55,
    companyId: undefined,
    rawPayload: { identity_review_status: 'pending' },
  }));
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockers, [
    'invalid_or_missing_cnpj',
    'missing_website',
    'missing_normalized_domain',
    'identity_evidence_url_missing',
    'legal_name_not_verified',
    'identity_review_not_approved',
    'confidence_below_070',
    'eligible_company_link_missing',
  ]);
});

test('allows only reviewed candidates linked to Company Master', () => {
  assert.deepEqual(evaluateCandidatePromotionReadiness(candidate()), { ready: true, blockers: [] });
});

test('assertion returns a 422-compatible error', () => {
  assert.throws(
    () => assertCandidatePromotionReady(candidate({ companyId: undefined })),
    (error: unknown) => error instanceof CandidatePromotionBlockedError
      && error.statusCode === 422
      && error.blockers.includes('eligible_company_link_missing'),
  );
});
