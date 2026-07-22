import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformRepository, searchProfileToRow } from './platformRepository.js';
import type { SearchProfile } from '../types/platform.js';

const sampleProfile = (overrides: Partial<SearchProfile> = {}): SearchProfile => ({
  id: 'sp_1',
  name: 'Brasil Middle Market Tech',
  segment: 'Fintech',
  subsegment: 'Credit, Embedded',
  companyType: 'Scale-up',
  geography: 'BR',
  creditProduct: 'Antecipação de recebíveis',
  receivables: ['Duplicatas', 'Cartão'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 120,
  status: 'active',
  profilePayload: { note: 'x' },
  ...overrides,
});

// Colunas que realmente existem na tabela viva `search_profiles` em produção.
const LIVE_COLUMNS = new Set([
  'id', 'name', 'description', 'target_segments', 'target_keywords',
  'min_employee_count', 'geography', 'active', 'config', 'created_at', 'updated_at',
]);

test('searchProfileToRow emits only columns that exist in the live schema', () => {
  // O bug: o write gravava segment/company_type/status/profile_payload/... que
  // não existem na tabela, derrubando todo o upsert e caindo na memória.
  const row = searchProfileToRow(sampleProfile());
  for (const key of Object.keys(row)) {
    assert.ok(LIVE_COLUMNS.has(key), `column '${key}' does not exist in live search_profiles`);
  }
});

test('searchProfileToRow derives active from status and round-trips the model in config', () => {
  const active = searchProfileToRow(sampleProfile({ status: 'active' }));
  assert.equal(active.active, true);
  const paused = searchProfileToRow(sampleProfile({ status: 'paused' }));
  assert.equal(paused.active, false);

  const row = searchProfileToRow(sampleProfile());
  // Escalares sem coluna própria sobrevivem em config.model (round-trip exato).
  assert.equal(row.config.model.companyType, 'Scale-up');
  assert.equal(row.config.model.minimumConfidence, 0.7);
  assert.equal(row.config.model.targetStructure, 'FIDC');
  // Payload arbitrário preservado ao lado do modelo.
  assert.equal((row.config as Record<string, unknown>).note, 'x');
});

test('searchProfileToRow derives target_segments/target_keywords for live consumers', () => {
  const row = searchProfileToRow(sampleProfile());
  // O runner de descoberta lê segment/subsegment a partir de target_segments.
  assert.deepEqual(row.target_segments, ['Fintech', 'Credit', 'Embedded']);
  // creditProduct (palavras) + targetStructure viram keywords pesquisáveis.
  assert.ok(row.target_keywords.includes('FIDC'));
  assert.ok(row.target_keywords.includes('Antecipação'));
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

test('saveTask + updateTask update task lifecycle', async () => {
  const repo = createPlatformRepository('memory');
  const saved = await repo.saveTask({
    companyId: 'cmp_neon_receivables',
    title: 'Coletar docs financeiros',
    description: 'Solicitar demonstrações e aging de recebíveis',
    owner: 'Coverage',
    status: 'todo',
    dueDate: null,
  });
  assert.equal(saved.status, 'todo');

  const updated = await repo.updateTask(saved.id, { status: 'in_progress' });
  assert.ok(updated);
  assert.equal(updated.status, 'in_progress');
});

test('savePipelineRow preserves id/createdAt when updating company pipeline row', async () => {
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
