import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompanyCreditReviewValidationError,
  normalizeCompanyCreditReviewAction,
  normalizeCompanyCreditReviewApproval,
  normalizeCompanyCreditReviewDraft,
  normalizeCompanyCreditReviewMaterialization,
} from './companyCreditReview.js';

const companyId = 'fdac3e35-1d23-41d1-a9fd-0376445d3992';
const reviewId = '798f4330-fa5b-4db1-a7f0-8e39b10b046a';

test('normalizes supported actions', () => {
  assert.equal(normalizeCompanyCreditReviewAction('save_draft'), 'save_draft');
  assert.equal(normalizeCompanyCreditReviewAction('approve'), 'approve');
  assert.equal(normalizeCompanyCreditReviewAction('materialize'), 'materialize');
});

test('rejects unsupported actions', () => {
  assert.throws(() => normalizeCompanyCreditReviewAction('publish'), CompanyCreditReviewValidationError);
});

test('normalizes a draft without altering the evidence payload', () => {
  const payload = { hasCreditProduct: true, evidence: [{ dimension: 'credit_product', url: 'https://example.com' }] };
  const normalized = normalizeCompanyCreditReviewDraft({ companyId, reviewPayload: payload, reviewNotes: 'review' });
  assert.equal(normalized.companyId, companyId);
  assert.deepEqual(normalized.reviewPayload, payload);
  assert.equal(normalized.reviewNotes, 'review');
});

test('requires valid company and review UUIDs', () => {
  assert.throws(
    () => normalizeCompanyCreditReviewDraft({ companyId: 'bad-id', reviewPayload: {} }),
    /company_id must be a valid UUID/,
  );
  assert.throws(
    () => normalizeCompanyCreditReviewApproval({ reviewId: 'bad-id', approvedOutcome: 'eligible' }),
    /review_id must be a valid UUID/,
  );
});

test('normalizes approval and keeps materialization enabled by default', () => {
  const normalized = normalizeCompanyCreditReviewApproval({ reviewId, approvedOutcome: 'eligible' });
  assert.equal(normalized.reviewId, reviewId);
  assert.equal(normalized.approvedOutcome, 'eligible');
  assert.equal(normalized.materialize, true);
});

test('accepts only governed outcomes', () => {
  assert.throws(
    () => normalizeCompanyCreditReviewApproval({ reviewId, approvedOutcome: 'maybe' }),
    /approvedOutcome must be eligible, monitor_only or ineligible/,
  );
});

test('normalizes an explicit materialization command', () => {
  assert.deepEqual(normalizeCompanyCreditReviewMaterialization({ company_id: companyId }), { companyId });
});
