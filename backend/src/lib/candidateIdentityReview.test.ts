import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateIdentityReviewValidationError,
  normalizeCandidateIdentityApprovalInput,
  normalizeCandidateIdentityRejectionInput,
} from './candidateIdentityReview.js';

test('normalizes an approved identity review', () => {
  const input = normalizeCandidateIdentityApprovalInput('candidate-1', {
    legalName: 'Creditas Soluções Ltda.',
    cnpj: '17.770.708/0001-24',
    website: 'https://www.creditas.com',
    identitySourceUrl: 'https://www.creditas.com/legal/termos-condicoes',
    evidenceSummary: 'Os termos oficiais identificam a entidade responsável pela plataforma, o CNPJ e o endereço institucional da companhia no Brasil.',
    confidence: 0.95,
  }, { userId: 'reviewer-1', email: 'reviewer@example.com' });

  assert.equal(input.cnpj, '17770708000124');
  assert.equal(input.legalName, 'Creditas Soluções Ltda.');
  assert.equal(input.reviewerUserId, 'reviewer-1');
});

test('blocks approval when identity evidence is incomplete', () => {
  assert.throws(() => normalizeCandidateIdentityApprovalInput('candidate-1', {
    legalName: 'Comp',
    cnpj: '00.000.000/0000-00',
    website: 'not-a-url',
    identitySourceUrl: '',
    evidenceSummary: 'Pouca evidência.',
    confidence: 0.4,
  }), (error: unknown) => {
    assert.ok(error instanceof CandidateIdentityReviewValidationError);
    assert.ok(error.blockers.includes('valid_cnpj_required'));
    assert.ok(error.blockers.includes('valid_website_required'));
    assert.ok(error.blockers.includes('identity_source_url_required'));
    return true;
  });
});

test('requires a substantive rejection reason', () => {
  assert.throws(
    () => normalizeCandidateIdentityRejectionInput('candidate-1', { reason: 'nome ambíguo' }),
    CandidateIdentityReviewValidationError,
  );

  const rejected = normalizeCandidateIdentityRejectionInput('candidate-1', {
    reason: 'Nome excessivamente ambíguo e sem evidência suficiente para reconciliar a entidade.',
  });
  assert.equal(rejected.candidateId, 'candidate-1');
});
