import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCatalogSeeds } from '../data/platformSeeds.js';
import { createPlatformRepository, mapCompanySignalRow, mapMonitoringOutputRow, mapSourceCatalogRow } from './platformRepository.js';

test('source seeds reuse canonical capital-market identities without duplicates', () => {
  const ids = sourceCatalogSeeds.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(sourceCatalogSeeds.filter((source) => source.url === 'https://dados.cvm.gov.br/dataset/fi-cad').length, 1);
  assert.equal(sourceCatalogSeeds.filter((source) => source.url === 'https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal').length, 1);
  assert.ok(ids.includes('src_cvm_fund_registry'));
  assert.ok(ids.includes('src_cvm_fidc_monthly'));
});

test('maps legacy monitoring output into the canonical runtime contract', () => {
  const mapped = mapMonitoringOutputRow({
    id: 'output-1',
    company_id: 'company-1',
    source_id: 'source-1',
    title: 'Notícia de funding',
    summary: 'Empresa anunciou captação.',
    observed_at: '2026-07-13T10:00:00.000Z',
    status: 'processed',
    source_confidence: 82,
    payload: {
      connectorStatus: 'real',
      items: [{ title: 'Empresa anunciou captação.' }],
    },
    output_payload: {},
    normalized_payload: {},
    connector_status: 'partial',
    confidence_score: 0,
  });

  assert.equal(mapped.title, 'Notícia de funding');
  assert.equal(mapped.connectorStatus, 'real');
  assert.equal(mapped.confidenceScore, 0.82);
  assert.equal(mapped.collectedAt, '2026-07-13T10:00:00.000Z');
  assert.equal((mapped.normalizedPayload.items as unknown[]).length, 1);
});

test('maps legacy company signal strength and evidence', () => {
  const mapped = mapCompanySignalRow({
    id: 'signal-1',
    company_id: 'company-1',
    source_id: 'source-1',
    signal_type: 'funding_gap_signal',
    strength: 78,
    confidence: 84,
    evidence_text: 'Empresa busca funding.',
    metadata: { note: 'Empresa busca funding.', observedVsInferred: 'inferred' },
    signal_strength: 0,
    confidence_score: 0,
    evidence_payload: {},
    observed_vs_inferred: 'observed',
    observed_at: '2026-07-13T10:00:00.000Z',
  });

  assert.equal(mapped.signalStrength, 78);
  assert.equal(mapped.confidenceScore, 0.84);
  assert.equal(mapped.evidencePayload.note, 'Empresa busca funding.');
  assert.equal(mapped.observedVsInferred, 'inferred');
});

test('normalizes live source status and URL into the runtime catalog contract', () => {
  const mapped = mapSourceCatalogRow({
    id: 'source-uuid',
    name: 'Fonte oficial',
    source_type: 'rss',
    category: 'News/RSS',
    status: 'active',
    health: 'healthy',
    metadata: { baseUrl: 'https://example.com/feed' },
  });

  assert.equal(mapped.status, 'real');
  assert.equal(mapped.url, 'https://example.com/feed');
});

test('movePipelineStage updates stage for a company', async () => {
  const repo = createPlatformRepository('memory');
  const before = await repo.getPipelineByCompany('cmp_neon_receivables');
  assert.ok(before);
  const moved = await repo.movePipelineStage('cmp_neon_receivables', 'Approach');
  assert.ok(moved);
  assert.equal(moved.stage, 'Approach');
});

test('updateNextAction persists next action', async () => {
  const repo = createPlatformRepository('memory');
  const updated = await repo.updateNextAction('cmp_neon_receivables', 'Agendar call com CFO');
  assert.ok(updated);
  assert.equal(updated.nextAction, 'Agendar call com CFO');
});

test('saveActivity persists activity with id', async () => {
  const repo = createPlatformRepository('memory');
  const saved = await repo.saveActivity({
    companyId: 'cmp_neon_receivables',
    type: 'meeting',
    title: 'Reunião de enquadramento',
    description: 'Kickoff com time financeiro',
    owner: 'Origination',
    status: 'open',
    dueDate: null,
  });
  assert.ok(saved.id);
  const list = await repo.listActivities('cmp_neon_receivables');
  assert.ok(list.some((item) => item.id === saved.id));
});

test('saveTask and updateTask preserve the task lifecycle', async () => {
  const repo = createPlatformRepository('memory');
  const saved = await repo.saveTask({
    companyId: 'cmp_neon_receivables',
    title: 'Coletar docs financeiros',
    description: 'Solicitar demonstrações e aging de recebíveis',
    owner: 'Coverage',
    status: 'todo',
    dueDate: null,
  });
  const updated = await repo.updateTask(saved.id, { status: 'in_progress' });
  assert.equal(saved.status, 'todo');
  assert.equal(updated?.status, 'in_progress');
});

test('savePipelineRow preserves identity when updating a company row', async () => {
  const repo = createPlatformRepository('memory');
  const first = await repo.savePipelineRow({
    companyId: 'cmp_neon_receivables',
    stage: 'Qualified',
    owner: 'Origination',
    nextAction: 'Atualizar tese',
  });
  const second = await repo.savePipelineRow({
    companyId: 'cmp_neon_receivables',
    stage: 'Approach',
    owner: 'Coverage',
    nextAction: 'Agendar call com CFO',
  });
  assert.equal(first.id, second.id);
  assert.equal(first.createdAt, second.createdAt);
  assert.equal(second.stage, 'Approach');
  assert.equal(second.owner, 'Coverage');
});
