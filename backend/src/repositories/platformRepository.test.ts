import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformRepository } from './platformRepository.js';

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
