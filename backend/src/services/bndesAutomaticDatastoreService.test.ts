import assert from 'node:assert/strict';
import test from 'node:test';
import { BndesAutomaticDatastoreService } from './bndesAutomaticDatastoreService.js';
import type { BndesAutomaticResource } from '../modules/public-data/bndesAutomaticDatastoreConnector.js';

class FakeClient {
  companies = [
    { id: '1', cnpj: '11.111.111/0001-11' },
    { id: '2', cnpj: '22.222.222/0001-22' },
    { id: '3', cnpj: '33.333.333/0001-33' },
  ];
  source = {
    id: 'source-1',
    status: 'partial',
    health: 'healthy',
    metadata: { code: 'src_bndes_financing_operations' } as Record<string, unknown>,
  };
  checkpoints: Array<Record<string, unknown>> = [];
  runs: Array<Record<string, unknown>> = [];

  async select(table: string) {
    if (table === 'companies') return this.companies;
    if (table === 'source_catalog') return [this.source];
    if (table === 'public_dataset_resource_checkpoints') return this.checkpoints.slice(-1);
    if (table === 'public_company_records') return [];
    throw new Error(`Unexpected select table: ${table}`);
  }

  async insert(table: string, rows: Array<Record<string, unknown>>) {
    if (table !== 'public_dataset_runs') throw new Error(`Unexpected insert table: ${table}`);
    this.runs.push(...rows);
    return rows;
  }

  async upsert(table: string, rows: Array<Record<string, unknown>>) {
    if (table === 'public_dataset_resource_checkpoints') {
      this.checkpoints = [rows[0]];
      return rows;
    }
    if (table === 'bronze_historical_records' || table === 'public_company_records') return rows;
    throw new Error(`Unexpected upsert table: ${table}`);
  }

  async update(table: string, payload: Record<string, unknown>, filters: Array<Record<string, unknown>>) {
    if (table === 'public_dataset_runs') {
      const id = filters.find((filter) => filter.column === 'id')?.value;
      const run = this.runs.find((row) => row.id === id);
      if (run) Object.assign(run, payload);
      return run ? [run] : [];
    }
    if (table === 'source_catalog') {
      Object.assign(this.source, payload);
      return [this.source];
    }
    return [];
  }

  async rpc() {
    return { outputs_written: 0, signals_written: 0 };
  }
}

const resource: BndesAutomaticResource = {
  resourceId: 'resource-automatic',
  resourceHash: 'hash-v1',
  sizeBytes: 1_192_933_510,
  datastoreActive: true,
  metadataSource: 'resource_show',
  key: 'bndes-automatic:resource-automatic:hash-v1',
  name: 'Operações indiretas automáticas',
  url: 'https://example.test/bndes.csv',
  format: 'csv',
  encoding: 'windows-1252',
  delimiter: ';',
  referenceDate: '2026-07-22',
  modifiedAt: '2026-07-22T21:02:00Z',
  etag: 'hash-v1',
};

test('BNDES target coverage resumes from the last completed Company Master batch', async () => {
  const client = new FakeClient();
  let pageCalls = 0;
  const service = () => new BndesAutomaticDatastoreService({
    client: client as never,
    discoverResource: async () => resource,
    fetchPage: async () => {
      pageCalls += 1;
      return { records: [], total: 0, offset: 0, limit: 1000 };
    },
    now: () => new Date('2026-07-24T16:00:00.000Z'),
  });

  const first = await service().run({ targetBatchSize: 2, maxTargetBatches: 1 });
  assert.equal(first.status, 'partial');
  assert.equal(first.nextTargetOffset, 2);
  assert.equal(first.targetBatchesProcessed, 1);
  assert.equal(client.checkpoints[0].status, 'partial');
  assert.equal((client.checkpoints[0].metadata as Record<string, unknown>).nextTargetOffset, 2);

  const second = await service().run({ targetBatchSize: 2, maxTargetBatches: 10 });
  assert.equal(second.status, 'completed');
  assert.equal(second.nextTargetOffset, 3);
  assert.equal(client.checkpoints[0].status, 'completed');
  assert.equal(client.source.status, 'real');
  assert.equal(client.source.metadata.targetCoverageAchieved, true);
  assert.equal(client.source.metadata.sourceWideCoverage, false);
  assert.equal(client.source.metadata.fullCoverageAchieved, false);

  const callsAfterCompletion = pageCalls;
  const third = await service().run({ targetBatchSize: 2, maxTargetBatches: 10 });
  assert.equal(third.status, 'up_to_date');
  assert.equal(pageCalls, callsAfterCompletion);
});
