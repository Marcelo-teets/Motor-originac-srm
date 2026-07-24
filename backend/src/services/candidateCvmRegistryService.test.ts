import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateCvmRegistryService } from './candidateCvmRegistryService.js';

test('returns up_to_date when resource and target fingerprint are checkpointed', async () => {
  const inserts: Array<{ table: string; rows: unknown[] }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const client = {
    select: async (table: string) => {
      if (table === 'candidate_decision_queue_v2') return [{ id: 'candidate-1', cnpj: '16670085000155' }];
      if (table === 'source_catalog') return [{
        id: 'source-1', status: 'partial', health: 'unknown',
        metadata: { code: 'src_cvm_open_company_registry' },
      }];
      if (table === 'public_dataset_resource_checkpoints') return [{
        status: 'completed', rows_scanned: 100, records_matched: 1,
        last_successful_run_at: '2026-07-24T10:00:00.000Z',
        metadata: { targetsMatched: 1 },
      }];
      return [];
    },
    insert: async (table: string, rows: unknown[]) => { inserts.push({ table, rows }); return rows; },
    update: async (table: string, payload: Record<string, unknown>) => { updates.push({ table, payload }); return []; },
    upsert: async () => [],
  };
  let streamCalls = 0;
  const service = new CandidateCvmRegistryService({
    client: client as never,
    discoverResource: async () => ({
      key: 'cvm-open-company-registry-current',
      name: 'CVM Cadastro de Companhias Abertas',
      url: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv',
      datasetUrl: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
      modifiedAt: 'Fri, 24 Jul 2026 11:00:00 GMT',
      etag: 'registry-v1',
    }),
    streamResource: async () => { streamCalls += 1; return { rowsScanned: 0, recordsMatched: 0 }; },
    now: () => new Date('2026-07-24T18:00:00.000Z'),
  });

  const result = await service.run({ triggerType: 'schedule' });

  assert.equal(result.status, 'up_to_date');
  assert.equal(result.targetCount, 1);
  assert.equal(result.targetsMatched, 1);
  assert.equal(streamCalls, 0);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, 'public_dataset_runs');
  assert.ok(updates.some((item) => item.table === 'public_dataset_runs'));
  assert.ok(updates.some((item) => item.table === 'source_catalog'));
});
