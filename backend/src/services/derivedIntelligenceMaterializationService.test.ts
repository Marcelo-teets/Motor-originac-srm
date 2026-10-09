import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCompaniesForDerivedMaterialization } from './derivedIntelligenceMaterializationService.js';
import type { CompanySeed, LeadScoreSnapshot, MonitoringOutput, QualificationSnapshot } from '../types/platform.js';

const company = (id: string): CompanySeed => ({
  id,
  legalName: id,
  tradeName: id,
  cnpj: '',
  website: '',
  geography: 'Brasil',
  segment: 'Tech',
  subsegment: 'Fintech',
  companyType: 'Middle Market',
  stage: 'Growth',
  creditProduct: 'Crédito',
  receivables: ['Boletos'],
  currentFundingStructure: 'Linhas bilaterais',
  description: '',
  signals: [],
  monitoring: { status: 'active', lastRunAt: '', outputs24h: 0, triggers24h: 0, websiteChanges: [], feedHighlights: [] },
  enrichment: { governanceMaturity: 'medium', underwritingMaturity: 'medium', operationalMaturity: 'medium', riskModelMaturity: 'medium', unitEconomicsQuality: 'mixed', spreadVsFundingQuality: 'neutral', concentrationRisk: 'medium', delinquencySignal: 'low', sourceConfidence: 0.8, sourceNotes: [] },
  sourceRecords: [],
  marketMapPeers: [],
  activities: [],
  dataStatus: 'real',
  identityVerified: true,
  entityResolutionEligible: true,
  monitoringEligible: true,
  decisionEligible: true,
  decisionEligibilityReason: 'test',
} as CompanySeed);

const qualification = (companyId: string, created_at: string) => ({ companyId, created_at } as QualificationSnapshot);
const lead = (companyId: string, createdAt: string) => ({ companyId, createdAt } as LeadScoreSnapshot);
const output = (companyId: string, collectedAt: string) => ({ companyId, collectedAt } as MonitoringOutput);

test('selects eligible companies missing qualification or lead score', () => {
  const due = selectCompaniesForDerivedMaterialization({
    companies: [company('a'), company('b')],
    qualifications: [qualification('b', '2026-10-09T10:00:00Z')],
    leadScores: [],
    monitoringOutputs: [],
  });
  assert.deepEqual(due, [
    { companyId: 'a', reason: 'missing_qualification' },
    { companyId: 'b', reason: 'missing_lead_score' },
  ]);
});

test('selects company when monitoring evidence is newer than the latest derived snapshots', () => {
  const due = selectCompaniesForDerivedMaterialization({
    companies: [company('a')],
    qualifications: [qualification('a', '2026-10-09T10:00:00Z')],
    leadScores: [lead('a', '2026-10-09T10:01:00Z')],
    monitoringOutputs: [output('a', '2026-10-09T10:05:00Z')],
  });
  assert.deepEqual(due, [{ companyId: 'a', reason: 'new_monitoring_evidence' }]);
});

test('does not recompute companies with up-to-date derived snapshots', () => {
  const due = selectCompaniesForDerivedMaterialization({
    companies: [company('a')],
    qualifications: [qualification('a', '2026-10-09T10:10:00Z')],
    leadScores: [lead('a', '2026-10-09T10:10:00Z')],
    monitoringOutputs: [output('a', '2026-10-09T10:05:00Z')],
  });
  assert.deepEqual(due, []);
});

test('excludes companies that are not decision eligible', () => {
  const blocked = { ...company('a'), decisionEligible: false } as CompanySeed;
  const due = selectCompaniesForDerivedMaterialization({
    companies: [blocked],
    qualifications: [],
    leadScores: [],
    monitoringOutputs: [],
  });
  assert.deepEqual(due, []);
});


test('canonical SQL eligibility set overrides stale TypeScript metadata in persistent materialization', () => {
  const staleMetadata = { ...company('a'), decisionEligible: false } as CompanySeed;
  const due = selectCompaniesForDerivedMaterialization({
    companies: [staleMetadata],
    qualifications: [],
    leadScores: [],
    monitoringOutputs: [],
    eligibleCompanyIds: new Set(['a']),
  });
  assert.deepEqual(due, [{ companyId: 'a', reason: 'missing_qualification' }]);
});

test('canonical SQL eligibility set can block a company even when local metadata says eligible', () => {
  const due = selectCompaniesForDerivedMaterialization({
    companies: [company('a')],
    qualifications: [],
    leadScores: [],
    monitoringOutputs: [],
    eligibleCompanyIds: new Set(),
  });
  assert.deepEqual(due, []);
});
