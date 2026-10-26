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
  review_payload: { confidence: 0 },
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
  source.review_payload = { confidence: null };
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
  source.review_payload = {};
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
  source.review_payload = { confidence: '' };
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
  source.review_payload = { confidence: false };
  assert.deepEqual(unreviewedCreditFields(source), ['confidence']);
  source.review_payload = { confidence: '0' };
  assert.deepEqual(unreviewedCreditFields(source), []);
});
