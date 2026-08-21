import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCandidateMediaRecencyGuard, evaluateCandidateMediaRecency } from './candidateMediaRecency.js';

const directFunding = (publishedAt: string) => ({
  publishedAt,
  candidate_role: 'operating_company',
  commercial_queue: true,
  commercial_semantics: {
    version: 3,
    signalClass: 'direct_funding_trigger',
    reason: 'explicit_funding_action_with_credit_instrument',
    explicitFundingNeed: true,
    automaticDecisionEligible: false,
    fundingAmount: { currency: 'BRL', amount: 1_070_000_000, raw: 'R$ 1,07 bilhão' },
  },
});

test('marks funding older than 365 days as historical', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');
  const result = evaluateCandidateMediaRecency(directFunding('2025-07-31T10:00:00.000Z'), now);
  assert.equal(result.stale, true);
  assert.ok((result.ageDays ?? 0) > 365);
});

test('suppresses stale funding from commercial queue but preserves amount and original class', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');
  const guarded = applyCandidateMediaRecencyGuard(directFunding('2025-07-31T10:00:00.000Z'), now);
  assert.equal(guarded.commercial_queue, false);
  assert.equal(guarded.commercial_semantics_reason, 'stale_media_funding_signal');
  const semantics = guarded.commercial_semantics as Record<string, unknown>;
  assert.equal(semantics.signalClass, 'historical_funding_signal');
  assert.equal(semantics.originalSignalClass, 'direct_funding_trigger');
  assert.equal(semantics.explicitFundingNeed, false);
  assert.deepEqual(semantics.fundingAmount, { currency: 'BRL', amount: 1_070_000_000, raw: 'R$ 1,07 bilhão' });
});

test('keeps recent funding commercial', () => {
  const guarded = applyCandidateMediaRecencyGuard(directFunding('2026-07-20T10:00:00.000Z'), new Date('2026-08-12T12:00:00.000Z'));
  assert.equal(guarded.commercial_queue, true);
  assert.equal((guarded.commercial_semantics as Record<string, unknown>).signalClass, 'direct_funding_trigger');
});

test('does not suppress an undated signal solely because date is unavailable', () => {
  const guarded = applyCandidateMediaRecencyGuard(directFunding(''), new Date('2026-08-12T12:00:00.000Z'));
  assert.equal(guarded.commercial_queue, true);
  assert.equal((guarded.commercial_recency as Record<string, unknown>).status, 'date_unavailable');
});
