import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveryHealth, P1_CANDIDATE_TARGET, P1_PROMOTION_TARGET } from './discoveryHealth.js';
import type { DiscoveredCandidateRecord, SearchProfileRunRecord } from './searchProfileCaptureService.js';
import type { SearchProfile } from '../types/platform.js';

const profile = (id: string, status: 'active' | 'paused' = 'active'): SearchProfile => ({
  id,
  name: `Profile ${id}`,
  segment: 'Fintech',
  subsegment: 'Credit',
  companyType: 'Scale-up',
  geography: 'Brasil',
  creditProduct: 'Antecipação',
  receivables: ['Cartão'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status,
  profilePayload: {},
});

const run = (overrides: Partial<SearchProfileRunRecord>): SearchProfileRunRecord => ({
  id: 'run_1',
  searchProfileId: 'sp_1',
  runStatus: 'completed',
  triggerMode: 'scheduled',
  sourceCount: 1,
  candidatesFound: 3,
  candidatesInserted: 3,
  candidatesPromoted: 0,
  metadata: {},
  createdAt: '2026-07-21T10:00:00Z',
  updatedAt: '2026-07-21T10:00:00Z',
  ...overrides,
});

const candidate = (overrides: Partial<DiscoveredCandidateRecord>): DiscoveredCandidateRecord => ({
  id: 'cand_1',
  searchProfileRunId: 'run_1',
  companyName: 'Alpha',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Credit',
  companyType: 'Scale-up',
  creditProduct: 'Antecipação',
  targetStructure: 'FIDC',
  sourceRef: 'vc-portfolio:Kaszek',
  evidenceSummary: 'listada',
  receivables: ['Cartão'],
  confidence: 0.6,
  dedupeKey: 'name:alpha',
  rawPayload: {},
  candidateStatus: 'captured',
  capturedAt: '2026-07-21T10:00:00Z',
  createdAt: '2026-07-21T10:00:00Z',
  updatedAt: '2026-07-21T10:00:00Z',
  ...overrides,
});

const now = () => new Date('2026-07-22T00:00:00Z');

test('buildDiscoveryHealth aggregates profiles, runs and the candidate funnel', () => {
  const health = buildDiscoveryHealth(
    [profile('sp_1'), profile('sp_2', 'paused')],
    [run({ id: 'r1', createdAt: '2026-07-21T09:00:00Z', finishedAt: '2026-07-21T09:05:00Z' }), run({ id: 'r2', runStatus: 'failed', createdAt: '2026-07-21T11:00:00Z' })],
    [
      candidate({ id: 'c1', candidateStatus: 'captured' }),
      candidate({ id: 'c2', candidateStatus: 'deduped' }),
      candidate({ id: 'c3', candidateStatus: 'promoted' }),
      candidate({ id: 'c4', candidateStatus: 'discarded', sourceRef: 'unknown' }),
    ],
    now,
  );

  assert.deepEqual(health.profiles, { total: 2, active: 1, inactive: 1 });
  assert.equal(health.runs.total, 2);
  assert.equal(health.runs.completed, 1);
  assert.equal(health.runs.failed, 1);
  assert.equal(health.runs.lastRunStatus, 'failed'); // r2 é o mais recente por createdAt
  assert.equal(health.candidates.total, 4);
  assert.equal(health.candidates.promoted, 1);
  assert.equal(health.candidates.withLineage, 3); // c4 tem sourceRef 'unknown'
  assert.equal(health.candidates.lineagePct, 75);
  assert.equal(health.funnel.candidateTarget, P1_CANDIDATE_TARGET);
  assert.equal(health.funnel.promotionTarget, P1_PROMOTION_TARGET);
  assert.equal(health.funnel.candidateProgressPct, 8); // 4/50
  assert.equal(health.funnel.promotionProgressPct, 5); // 1/20
  assert.equal(health.note, undefined);
});

test('buildDiscoveryHealth surfaces a note when no profile is active', () => {
  const health = buildDiscoveryHealth([profile('sp_1', 'paused')], [], [], now);
  assert.equal(health.profiles.active, 0);
  assert.match(health.note ?? '', /nenhum ativo/);
});

test('buildDiscoveryHealth notes active profiles that never ran', () => {
  const health = buildDiscoveryHealth([profile('sp_1')], [], [], now);
  assert.match(health.note ?? '', /nenhuma execução registrada/);
  assert.equal(health.runs.lastRunAt, null);
});

test('buildDiscoveryHealth caps funnel progress at 100 and reports empty state', () => {
  const promoted = Array.from({ length: 30 }, (_, i) => candidate({ id: `c${i}`, candidateStatus: 'promoted' }));
  const health = buildDiscoveryHealth([profile('sp_1')], [run({})], promoted, now);
  assert.equal(health.funnel.promotionProgressPct, 100); // 30/20 capado
  assert.equal(health.funnel.candidateProgressPct, 60); // 30/50

  const empty = buildDiscoveryHealth([], [], [], now);
  assert.equal(empty.candidates.lineagePct, 0);
  assert.match(empty.note ?? '', /Nenhum search profile/);
});
