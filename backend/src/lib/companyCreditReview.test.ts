import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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

test('company credit-review RPCs use verified Neon Auth identity, never profile role alone', () => {
  const runtime = readFileSync(new URL('../services/companyCreditReviewRuntime.ts', import.meta.url), 'utf8');
  const profiles = readFileSync(new URL('./userProfiles.ts', import.meta.url), 'utf8');
  assert.match(runtime, /import \{ requireGodModeProfile \} from '\.\.\/lib\/userProfiles\.js'/);
  assert.match(runtime, /async requireGodMode\(userId: string\) \{\s*\/\/[\s\S]*?return requireGodModeProfile\(userId\);/);
  assert.doesNotMatch(runtime, /select:\s*'id,role,status'/);
  assert.match(profiles, /join neon_auth\."user" a on a\.id = p\.id/);
  assert.match(profiles, /hasVerifiedInstitutionalIdentity\(row\.email, row\.auth_email, row\.email_verified, row\.auth_banned\)/);
  assert.match(profiles, /if \(!profile \|\| profile\.role !== 'god_mode'\)/);
});
