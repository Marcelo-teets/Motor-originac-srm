import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateNewsSemanticsService } from './candidateNewsSemanticsService.js';

const candidate = (id: string, companyName: string, title: string, raw: Record<string, unknown> = {}) => ({
  id,
  company_name: companyName,
  source_ref: 'src_finsiders_rss',
  evidence_summary: title,
  candidate_status: 'captured',
  raw_payload: {
    title,
    transportSourceRef: 'google-news-rss',
    ...raw,
  },
  updated_at: '2026-08-12T03:00:00.000Z',
});

test('classifies direct funding, market intermediary and editorial noise in one bounded pass', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
  const client = {
    select: async () => [
      candidate('open-co', 'Open Co', 'Open Co capta FIDC de R$ 50 milhões para expandir crédito'),
      candidate('vert', 'VERT', 'VERT estrutura R$ 1 bi em consignado privado para banco e fintech'),
      candidate('interview', 'Entrevista', 'Entrevista - CEO da CERC fala sobre duplicata eletrônica'),
    ],
    update: async (table: string, payload: Record<string, unknown>, filters: unknown[]) => {
      updates.push({ table, payload, filters });
      return [];
    },
  };

  const service = new CandidateNewsSemanticsService({
    client: client as never,
    now: () => new Date('2026-08-12T03:30:00.000Z'),
  });
  const result = await service.run({ limit: 10 });

  assert.equal(result.status, 'completed');
  assert.equal(result.inspected, 3);
  assert.equal(result.classified, 3);
  assert.equal(result.directFunding, 1);
  assert.equal(result.intermediaries, 1);
  assert.equal(result.editorialNoiseDiscarded, 1);
  assert.equal(result.errors, 0);
  assert.equal(updates.length, 3);

  const openCoPayload = updates[0].payload.raw_payload as Record<string, unknown>;
  assert.equal(openCoPayload.candidate_role, 'operating_company');
  assert.equal(openCoPayload.commercial_queue, true);
  assert.equal(openCoPayload.commercial_semantics_version, 3);
  assert.equal('candidate_status' in updates[0].payload, false);
  assert.equal('decision_eligible' in openCoPayload, false);

  const vertPayload = updates[1].payload.raw_payload as Record<string, unknown>;
  assert.equal(vertPayload.candidate_role, 'financial_intermediary');
  assert.equal(vertPayload.commercial_queue, false);

  const noisePayload = updates[2].payload.raw_payload as Record<string, unknown>;
  assert.equal(updates[2].payload.candidate_status, 'discarded');
  assert.equal(noisePayload.classification_status, 'discarded_non_entity');
});

test('skips already classified current-version candidates unless forced', async () => {
  let updates = 0;
  const client = {
    select: async () => [candidate(
      'current',
      'Open Co',
      'Open Co capta FIDC de R$ 50 milhões',
      { commercial_semantics_version: 3 },
    )],
    update: async () => { updates += 1; return []; },
  };
  const service = new CandidateNewsSemanticsService({ client: client as never });
  const result = await service.run();
  assert.equal(result.skippedCurrentVersion, 1);
  assert.equal(result.classified, 0);
  assert.equal(updates, 0);
});

test('automatically reclassifies previous v2 semantics after v3 rule change', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    select: async () => [candidate(
      'cerc',
      'CERC',
      'CERC fecha acordo com fintech Adiante e registra R$ 11 milhões em duplicatas eletrônicas',
      { commercial_semantics_version: 2, commercial_queue: true },
    )],
    update: async (_table: string, payload: Record<string, unknown>) => { updates.push(payload); return []; },
  };
  const service = new CandidateNewsSemanticsService({ client: client as never });
  const result = await service.run();
  assert.equal(result.classified, 1);
  assert.equal(result.relevantUnclassified, 1);
  assert.equal(result.skippedCurrentVersion, 0);
  const rawPayload = updates[0].raw_payload as Record<string, unknown>;
  assert.equal(rawPayload.commercial_semantics_version, 3);
  assert.equal(rawPayload.commercial_queue, false);
  assert.equal(rawPayload.candidate_role, 'needs_classification');
});

test('force reclassifies a current-version candidate without enabling promotion', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    select: async () => [candidate(
      'current',
      'PicPay',
      'PicPay compra BX Blue, fintech de consignado público',
      { commercial_semantics_version: 3, promotion_ready: false, identity_review_status: 'pending' },
    )],
    update: async (_table: string, payload: Record<string, unknown>) => { updates.push(payload); return []; },
  };
  const service = new CandidateNewsSemanticsService({ client: client as never });
  const result = await service.run({ force: true });
  assert.equal(result.classified, 1);
  assert.equal(result.creditExpansion, 1);
  const rawPayload = updates[0].raw_payload as Record<string, unknown>;
  assert.equal(rawPayload.promotion_ready, false);
  assert.equal(rawPayload.identity_review_status, 'pending');
  assert.equal('decision_eligible' in rawPayload, false);
});
