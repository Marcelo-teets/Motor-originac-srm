import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFidcHumanReviewSubmission, normalizeFidcReviewCnpj } from './fidcAssignorHumanReviewService.js';

const valid = {
  cnpj: '12.345.678/0001-90',
  disposition: 'needs_evidence',
  rationale: 'Apenas há vínculo com FIDC; ainda não há prova de recebíveis próprios estruturáveis.',
  nextAction: 'Confirmar modelo de negócio, CNPJ, lastro e porte.',
};

test('FIDC review normalization preserves explicit unknowns and requires source-valid identity format', () => {
  const value = normalizeFidcHumanReviewSubmission(valid);
  assert.equal(value.cnpj, '12345678000190');
  assert.equal(value.disposition, 'needs_evidence');
  assert.match(value.rationale, /ainda não há prova/);
  assert.equal(Object.keys(value).length, 4);
});

test('FIDC review only accepts human triage dispositions, never financial eligibility', () => {
  for (const disposition of ['eligible', 'approved', 'promoted', 'score_ready', 'credit_approved', '']) {
    assert.throws(
      () => normalizeFidcHumanReviewSubmission({ ...valid, disposition }),
      /Unsupported FIDC review disposition/,
    );
  }
});

test('FIDC review requires meaningful rationale and next action, and rejects malformed CNPJs', () => {
  assert.throws(() => normalizeFidcHumanReviewSubmission({ ...valid, rationale: 'FIDC' }), /30 to 3000/);
  assert.throws(() => normalizeFidcHumanReviewSubmission({ ...valid, nextAction: 'Ver' }), /10 to 1000/);
  assert.throws(() => normalizeFidcHumanReviewSubmission({ ...valid, cnpj: '12.34' }), /14 digits/);
  assert.throws(() => normalizeFidcHumanReviewSubmission({ ...valid, cnpj: null }), /14 digits/);
});

test('FIDC review cannot smuggle reviewer identity or promotional action through request body', () => {
  const value = normalizeFidcHumanReviewSubmission({
    ...valid,
    reviewerUserId: 'spoofed',
    reviewerEmail: 'forged@example.com',
    autoPromote: true,
    decisionEligible: true,
    pipelineStage: 'Mandato Assinado',
  });
  assert.equal('reviewerUserId' in value, false);
  assert.equal('reviewerEmail' in value, false);
  assert.equal('autoPromote' in value, false);
  assert.equal('decisionEligible' in value, false);
  assert.equal('pipelineStage' in value, false);
});

test('FIDC human review rejects alphanumeric CNPJ explicitly until SQL source/history support a versioned migration', () => {
  assert.throws(() => normalizeFidcReviewCnpj('00.000.000/E08G-12'),
    /Alphanumeric CNPJ review requires a versioned source\/DB migration/);
  assert.throws(() => normalizeFidcHumanReviewSubmission({
    ...valid, cnpj: '00.000.000/E08G-12',
  }), /Alphanumeric CNPJ review requires a versioned source\/DB migration/);
  assert.equal(normalizeFidcReviewCnpj('11.444.777/0001-61'), '11444777000161');
  assert.notEqual(normalizeFidcReviewCnpj('11.444.777/0001-61'), '000000000012');
});
