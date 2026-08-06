import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSheetRows,
  buildSummary,
  categoryDisplay,
  criticalityDisplay,
  frequencyDisplay,
  healthDisplay,
  nextAction,
  runStatusDisplay,
  statusDisplay,
} from './source-control-sheet-sync.mjs';

test('maps operational enums to the official Portuguese labels', () => {
  assert.equal(statusDisplay('real'), 'Real');
  assert.equal(statusDisplay('active'), 'Ativa');
  assert.equal(healthDisplay('degraded'), 'Degradada');
  assert.equal(frequencyDisplay('hourly_control_daily_export'), 'Horário + export diário');
  assert.equal(criticalityDisplay('critical'), 'Crítica');
  assert.equal(runStatusDisplay('completed'), 'Concluída');
  assert.equal(categoryDisplay('public_procurement_receivables'), 'Recebíveis do setor público');
});

test('does not promote a partial source because a run completed', () => {
  const source = {
    status: 'partial',
    health: 'degraded',
    last_run_status: 'completed',
    last_run_at: '2026-07-27T11:17:00Z',
  };
  assert.equal(nextAction(source), 'Concluir cobertura e validar ingestão em produção.');
});

test('builds the 12-column sheet contract and sorts names in pt-BR order', () => {
  const sources = [
    {
      name: 'Zeta', status: 'planned', health: 'degraded', category: 'regulatory',
      frequency: 'weekly', priority: 3, criticality: 'medium', items_collected: 0,
    },
    {
      name: 'Agente Tomé', status: 'real', health: 'healthy', category: 'funds_structured_data',
      frequency: 'daily', priority: 1, criticality: 'high', last_run_status: 'completed',
      last_run_at: '2026-07-27T11:17:00Z', items_collected: 10,
    },
  ];
  const rows = buildSheetRows(sources);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].length, 12);
  assert.equal(rows[1][1], 'Agente Tomé');
  assert.equal(rows[1][2], 'Real');
  assert.equal(rows[2][1], 'Zeta');
});

test('builds the executive summary from current source states', () => {
  const summary = buildSummary([
    { status: 'real', health: 'healthy' },
    { status: 'active', health: 'healthy' },
    { status: 'partial', health: 'degraded' },
    { status: 'planned', health: 'degraded' },
  ]);
  assert.deepEqual(summary[0], ['Total', 4, 'Real', 1, 'Ativa', 1, 'Parcial', 1]);
  assert.deepEqual(summary[1], ['Planejada', 1, 'Saudável', 2, 'Degradada', 2, 'Controle', 'Supabase → Sheets']);
});
