import assert from 'node:assert/strict';
import test from 'node:test';
import { CandidateCvmRegistryService } from './candidateCvmRegistryService.js';

test('returns up_to_date when resource and target fingerprint are checkpointed', async () => {
  const inserts: Array<{ table: string; rows: unknown[] }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const selectedTables: string[] = [];
  const client = {
    select: async (table: string) => {
      selectedTables.push(table);
      if (table === 'discovered_company_candidates') return [{
        id: 'candidate-1',
        cnpj: '16670085000155',
        company_id: null,
        dedupe_key: 'cnpj:16670085000155',
        company_name: 'Empresa Teste',
        candidate_status: 'new',
        confidence: 0.9,
        captured_at: '2026-07-24T12:00:00.000Z',
        created_at: '2026-07-24T12:00:00.000Z',
        raw_payload: {
          candidate_role: 'operating_issuer',
          commercial_queue: true,
          promotion_ready: true,
        },
      }];
      if (table === 'companies') return [];
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
  assert.ok(selectedTables.includes('discovered_company_candidates'));
  assert.ok(selectedTables.includes('companies'));
  assert.ok(!selectedTables.includes('candidate_decision_queue_v2'));
});

test('uses canonical candidate ordering and excludes candidates already matched to Company Master', async () => {
  const streamedTargets: string[] = [];
  const client = {
    select: async (table: string) => {
      if (table === 'discovered_company_candidates') return [
        {
          id: 'candidate-old',
          cnpj: '16670085000155',
          company_id: null,
          dedupe_key: 'same-company',
          company_name: 'Empresa Teste',
          candidate_status: 'new',
          confidence: 0.4,
          captured_at: '2026-07-20T12:00:00.000Z',
          created_at: '2026-07-20T12:00:00.000Z',
          raw_payload: { candidate_role: 'operating_issuer', commercial_queue: true, promotion_ready: false },
        },
        {
          id: 'candidate-new',
          cnpj: '16670085000155',
          company_id: null,
          dedupe_key: 'same-company',
          company_name: 'Empresa Teste',
          candidate_status: 'new',
          confidence: 0.9,
          captured_at: '2026-07-24T12:00:00.000Z',
          created_at: '2026-07-24T12:00:00.000Z',
          raw_payload: { candidate_role: 'operating_issuer', commercial_queue: true, promotion_ready: true },
        },
        {
          id: 'already-mastered',
          cnpj: '11222333000181',
          company_id: null,
          dedupe_key: 'mastered-company',
          company_name: 'Já Cadastrada',
          candidate_status: 'new',
          confidence: 1,
          captured_at: '2026-07-24T12:00:00.000Z',
          created_at: '2026-07-24T12:00:00.000Z',
          raw_payload: { candidate_role: 'operating_issuer', commercial_queue: true, promotion_ready: true },
        },
      ];
      if (table === 'companies') return [{ id: 'company-1', cnpj: '11.222.333/0001-81' }];
      if (table === 'source_catalog') return [{
        id: 'source-1', status: 'real', health: 'healthy',
        metadata: { code: 'src_cvm_open_company_registry' },
      }];
      if (table === 'public_dataset_resource_checkpoints') return [];
      return [];
    },
    insert: async (_table: string, rows: unknown[]) => rows,
    update: async () => [],
    upsert: async (_table: string, rows: unknown[]) => rows,
  };
  const service = new CandidateCvmRegistryService({
    client: client as never,
    discoverResource: async () => ({
      key: 'cvm-open-company-registry-current',
      name: 'CVM Cadastro de Companhias Abertas',
      url: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv',
      datasetUrl: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
      modifiedAt: 'Fri, 24 Jul 2026 11:00:00 GMT',
      etag: 'registry-v2',
    }),
    streamResource: async ({ targetCnpjs }) => {
      streamedTargets.push(...targetCnpjs);
      return { rowsScanned: 10, recordsMatched: 0 };
    },
    now: () => new Date('2026-07-24T18:00:00.000Z'),
  });

  const result = await service.run({ triggerType: 'schedule', force: true });

  assert.equal(result.status, 'completed');
  assert.equal(result.targetCount, 1);
  assert.deepEqual(streamedTargets, ['16670085000155']);
});
