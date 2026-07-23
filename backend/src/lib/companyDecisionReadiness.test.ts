import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCompanyDecisionReadiness } from './companyDecisionReadiness.js';

const validSnapshot = () => ({
  status: 'blocked_no_real_companies', gateOpen: false, qualityGateVersion: 1,
  companyMaster: { totalCompanies: 8, eligibleCompanies: 0, demoCompanies: 8, unapprovedCompanies: 0, eligibleCompanyIds: [] },
  quality: { openCompanyViolations: 8, latestQualityEventAt: null, writeGuardsActive: true },
  historicalExcludedRows: { qualificationSnapshots: 968, leadScoreSnapshots: 968, scoreSnapshots: 4872, companyPatterns: 7, rankingRows: 152, pipelineRows: 8, thesisOutputs: 3 },
  candidateQueue: { total: 10, withCnpj: 0, captured: 8, review: 0, promoted: 0, latestCaptureAt: null },
  publicEvidence: { records: 0, linkedRecords: 0, unlinkedRecords: 0, distinctCnpjs: 0, latestObservedAt: null },
  policy: { historicalRowsVisibleForAudit: true, historicalRowsVisibleAsCurrentLeads: false, automaticPromotion: false, requiresCnpjReconciliation: true, requiresEvidenceReview: true },
  nextActions: [{ code: 'capture_real_candidates', label: 'Capturar candidatas reais', route: '/capture-inbox', priority: 1 }],
  generatedAt: new Date().toISOString(),
});

test('accepts a safe Company Master readiness contract', () => {
  const snapshot = normalizeCompanyDecisionReadiness(validSnapshot());
  assert.equal(snapshot.gateOpen, false);
  assert.equal(snapshot.companyMaster.eligibleCompanies, 0);
});

test('rejects historical rows exposed as current leads', () => {
  const snapshot = validSnapshot();
  snapshot.policy.historicalRowsVisibleAsCurrentLeads = true as false;
  assert.throws(() => normalizeCompanyDecisionReadiness(snapshot));
});

test('rejects automatic promotion', () => {
  const snapshot = validSnapshot();
  snapshot.policy.automaticPromotion = true as false;
  assert.throws(() => normalizeCompanyDecisionReadiness(snapshot));
});
