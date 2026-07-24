import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';
import {
  CaptureRuntimeDeadlineError,
  assertBoundedCaptureScope,
  buildBoundedCaptureTargets,
  withCaptureDeadline,
} from './boundedCapture.js';
import { attachCompanyDecisionMetadata } from './companyDecisionEligibility.js';

const company = (id: string, metadata: Record<string, unknown>): CompanySeed => attachCompanyDecisionMetadata({
  id,
  legalName: id,
  tradeName: id,
  cnpj: '',
  website: '',
  geography: 'BR',
  segment: 'Unknown',
  subsegment: 'Unknown',
  companyType: 'Unknown',
  stage: 'Identified',
  creditProduct: 'Unknown',
  receivables: [],
  currentFundingStructure: 'Unknown',
  description: '',
  signals: [],
  monitoring: { status: 'queued', lastRunAt: '', outputs24h: 0, triggers24h: 0, websiteChanges: [], feedHighlights: [] },
  enrichment: {
    governanceMaturity: 'medium', underwritingMaturity: 'medium', operationalMaturity: 'medium', riskModelMaturity: 'medium',
    unitEconomicsQuality: 'mixed', spreadVsFundingQuality: 'neutral', concentrationRisk: 'medium', delinquencySignal: 'low',
    sourceConfidence: 0.5, sourceNotes: [],
  },
  sourceRecords: [], marketMapPeers: [], activities: [],
}, metadata);

const source = (id: string, status: SourceCatalogEntry['status'], health: SourceCatalogEntry['health']): SourceCatalogEntry => ({
  id, name: id, sourceType: 'api', category: 'test', status, health, metadata: {},
});

test('fanout includes monitoring entities and healthy real sources only', () => {
  const targets = buildBoundedCaptureTargets([
    company('real-monitoring', {
      data_status: 'real', identity_review_status: 'approved', identity_verified: true,
      entity_resolution_eligible: true, monitoring_eligible: true, decision_eligible: false,
    }),
    company('demo', { data_status: 'mock', synthetic_seed: true }),
  ], [
    source('healthy-real', 'real', 'healthy'),
    source('degraded-real', 'real', 'degraded'),
    source('planned', 'planned', 'healthy'),
  ], true);

  assert.deepEqual(targets, [{
    companyId: 'real-monitoring', companyName: 'real-monitoring', sourceId: 'healthy-real', sourceName: 'healthy-real',
  }]);
});

test('bounded scope requires company and source', () => {
  assert.throws(() => assertBoundedCaptureScope('company', null), /requires both companyId and sourceId/);
  assert.doesNotThrow(() => assertBoundedCaptureScope('company', 'source'));
});

test('deadline converts a hanging capture into a controlled error', async () => {
  await assert.rejects(
    () => withCaptureDeadline(new Promise(() => undefined), 5),
    (error: unknown) => error instanceof CaptureRuntimeDeadlineError && error.statusCode === 504,
  );
});
