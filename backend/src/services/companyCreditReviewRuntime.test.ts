import assert from 'node:assert/strict';
import test from 'node:test';
import { unreviewedCreditFields } from './companyCreditReviewRuntime.js';

type ReviewInput = Parameters<typeof unreviewedCreditFields>[0];

const reviewed = (): ReviewInput => ({
  id: 'review-test',
  company_id: 'company-test',
  review_version: 1,
  status: 'draft',
  has_credit_product: false,
  credit_is_core: false,
  has_receivables: false,
  receivables_structurable: false,
  has_fidc: false,
  uses_structured_debt: false,
  fit_fidc: false,
  fit_dcm: false,
  structural_score: 0,
  capital_score: 0,
  receivables_score: 0,
  execution_score: 0,
  timing_score: 0,
  confidence: 0,
  review_payload: {
    hasCreditProduct: false, creditIsCore: false, hasReceivables: false,
    receivablesStructurable: false, hasFidc: false, usesStructuredDebt: false,
    fitFidc: false, fitDcm: false, structuralScore: 0, capitalScore: 0,
    receivablesScore: 0, executionScore: 0, timingScore: 0, confidence: 0,
  },
});

test('backend approval guard preserves explicit no and zero assessments', () => {
  assert.deepEqual(unreviewedCreditFields(reviewed()), []);
});

test('backend approval guard blocks unknown boolean and numeric evidence', () => {
  const source = reviewed();
  source.has_credit_product = null;
  source.credit_is_core = undefined;
  source.fit_fidc = null;
  source.structural_score = null;
  source.execution_score = undefined;
  source.review_payload = { ...reviewed().review_payload, confidence: null };
  assert.deepEqual(unreviewedCreditFields(source), [
    'has_credit_product',
    'credit_is_core',
    'fit_fidc',
    'structural_score',
    'execution_score',
    'confidence',
  ]);
});

test('backend approval guard distinguishes missing confidence from valid zero', () => {
  const source = reviewed();
  source.review_payload = { ...reviewed().review_payload };
  delete source.review_payload!.confidence;
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
  source.review_payload = { ...reviewed().review_payload, confidence: '' };
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
  source.review_payload = { ...reviewed().review_payload, confidence: false };
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
  source.review_payload = { ...reviewed().review_payload, confidence: '0' };
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
});

test('privileged approval guard rejects tampered payload and out-of-range scores', () => {
  const forged = reviewed();
  forged.review_payload = { ...reviewed().review_payload, hasCreditProduct: true };
  assert.deepEqual(unreviewedCreditFields(forged), ['has_credit_product']);

  const missingScore = reviewed();
  missingScore.review_payload = { ...reviewed().review_payload, structuralScore: null };
  assert.deepEqual(unreviewedCreditFields(missingScore), ['structural_score']);

  const outOfRange = reviewed();
  outOfRange.structural_score = -1;
  outOfRange.review_payload = { ...reviewed().review_payload, structuralScore: -1, confidence: 1.01 };
  outOfRange.confidence = 1.01;
  assert.deepEqual(unreviewedCreditFields(outOfRange), ['structural_score', 'confidence']);

  const legitimate = reviewed();
  legitimate.structural_score = 100;
  legitimate.review_payload = { ...reviewed().review_payload, structuralScore: 100, confidence: 1 };
  legitimate.confidence = 1;
  assert.deepEqual(unreviewedCreditFields(legitimate), []);
});
