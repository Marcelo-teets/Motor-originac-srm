import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicBulkResource } from '../modules/public-data/publicBulkDatasetConnector.js';
import {
  isUnchangedResource,
  PublicDatasetIngestionRunner,
  type DataClient,
  type PublicDatasetIngestionAdapter,
  type PublicDatasetRecord,
} from './publicDatasetIngestionRunner.js';

type Call = { method: string; table: string; payload?: unknown; filters?: unknown };

const resource = (key: string, extra: Partial<PublicBulkResource> = {}): PublicBulkResource => ({
  key,
  name: `${key}.csv`,
  url: `https://data.example/${key}.csv`,
  format: 'csv',
  encoding: 'utf-8',
  delimiter: ';',
  referenceDate: '2026-09-01',
  ...extra,
});

const record = (recordKey: string, contentHash: string): PublicDatasetRecord => ({
  datasetCode: 'demo',
  sourceCode: 'src_demo',
  recordKey,
  entityCnpj: '17770708000124',
  entityName: 'Demo SA',
  recordType: 'registration',
  referenceDate: '2026-09-01',
  amount: null,
  status: 'active',
  sourceUrl: 'https://data.example/a.csv',
  resourceKey: 'a',
  contentHash,
  rawPayload: { cnpj: '17770708000124' },
  normalizedPayload: {},
});

const fakeClient = (overrides: {
  checkpoints?: unknown[];
  existingRecords?: Array<{ record_key: string; content_hash: string }>;
  failInsertRun?: boolean;
  failCheckpointSelect?: boolean;
} = {}) => {
  const calls: Call[] = [];
  const client = {
    async select(table: string, options: { filters?: unknown } = {}) {
      calls.push({ method: 'select', table, filters: options.filters });
      if (table === 'source_catalog') return [{ id: 'source-1', status: 'partial', health: 'healthy', metadata: { code: 'src_demo', keep: true } }];
      if (table === 'public_dataset_resource_checkpoints') {
        if (overrides.failCheckpointSelect) throw new Error('checkpoint table unavailable');
        return overrides.checkpoints ?? [];
      }
      if (table === 'public_company_records') return overrides.existingRecords ?? [];
      return [];
    },
    async insert(table: string, rows: unknown[]) {
      calls.push({ method: 'insert', table, payload: rows });
      if (table === 'public_dataset_runs' && overrides.failInsertRun) throw new Error('duplicate running run');
      return rows;
    },
    async upsert(table: string, rows: unknown[]) {
      calls.push({ method: 'upsert', table, payload: rows });
      return rows;
    },
    async update(table: string, payload: unknown, filters: unknown) {
      calls.push({ method: 'update', table, payload, filters });
      return [];
    },
    async rpc() {
      calls.push({ method: 'rpc', table: 'sync' });
      return null;
    },
  };
  return { client: client as unknown as DataClient, calls };
};

const adapter = (overrides: Partial<PublicDatasetIngestionAdapter<'demo' | 'other', PublicDatasetRecord>> = {}) => {
  const synced: string[] = [];
  const value: PublicDatasetIngestionAdapter<'demo' | 'other', PublicDatasetRecord> = {
    missingClientMessage: 'no client',
    noTargetsMessage: 'no targets',
    partialImplementationPhase: 'partial_phase',
    runMetadata: { connectorFamily: 'test_family' },
    sourceCodeFor: () => 'src_demo',
    discover: async () => [resource('a'), resource('b', { etag: 'etag-b' })],
    stream: async ({ resource: current, onRecord }) => {
      if (current.key === 'a') {
        await onRecord(record('new', 'h1'));
        await onRecord(record('changed', 'h2-new'));
        await onRecord(record('same', 'h3'));
      }
      return { rowsScanned: 10, recordsMatched: current.key === 'a' ? 3 : 0 };
    },
    loadTargetCnpjs: async () => new Set(['17770708000124']),
    syncOutputs: async (_client, datasetCode) => {
      synced.push(datasetCode);
      return { outputsWritten: 2, signalsWritten: 1 };
    },
    ...overrides,
  };
  return { value, synced };
};

test('skips unchanged scheduled resources and counts inserted/updated/unchanged records', async () => {
  const { client, calls } = fakeClient({
    checkpoints: [{ resource_key: 'b', status: 'completed', etag: 'etag-b', resource_modified_at: null, content_hash: 'x', last_successful_run_at: null }],
    existingRecords: [{ record_key: 'changed', content_hash: 'h2-old' }, { record_key: 'same', content_hash: 'h3' }],
  });
  const { value, synced } = adapter();
  const result = await new PublicDatasetIngestionRunner(client, value).run({ datasets: ['demo'], triggerType: 'schedule' });

  const [summary] = result.datasets;
  assert.equal(result.status, 'real');
  assert.equal(summary.status, 'completed');
  assert.equal(summary.resourcesProcessed, 1);
  assert.equal(summary.resourcesSkipped, 1);
  assert.deepEqual(
    [summary.recordsInserted, summary.recordsUpdated, summary.recordsUnchanged, summary.normalizedRowsWritten],
    [1, 1, 1, 2],
  );
  assert.deepEqual([summary.outputsWritten, summary.signalsWritten], [2, 1]);
  assert.deepEqual(synced, ['demo']);

  const bronze = calls.find((call) => call.method === 'upsert' && call.table === 'bronze_historical_records');
  assert.deepEqual((bronze?.payload as Array<{ record_key: string }>).map((row) => row.record_key), ['new', 'changed']);

  const runInsert = calls.find((call) => call.method === 'insert' && call.table === 'public_dataset_runs');
  assert.equal((runInsert?.payload as Array<{ metadata: Record<string, unknown> }>)[0].metadata.connectorFamily, 'test_family');
  const runUpdate = calls.find((call) => call.method === 'update' && call.table === 'public_dataset_runs' && (call.payload as { status: string }).status !== 'failed');
  assert.equal((runUpdate?.payload as { status: string }).status, 'completed');
  const sourceUpdate = calls.find((call) => call.method === 'update' && call.table === 'source_catalog');
  assert.equal((sourceUpdate?.payload as { metadata: Record<string, unknown> }).metadata.implementationPhase, 'partial_phase');
  assert.equal((sourceUpdate?.payload as { metadata: Record<string, unknown> }).metadata.keep, true);
});

test('reports a run-lock conflict as partial without touching the run', async () => {
  const { client, calls } = fakeClient({ failInsertRun: true });
  const result = await new PublicDatasetIngestionRunner(client, adapter().value).run({ datasets: ['demo'] });
  assert.equal(result.datasets[0].status, 'partial');
  assert.match(result.datasets[0].errors[0], /^run_lock: duplicate running run/);
  assert.equal(calls.some((call) => call.method === 'update' && call.table === 'source_catalog'), false);
});

test('finalizes the run row when processing fails unexpectedly (no stuck lock)', async () => {
  const { client, calls } = fakeClient({ failCheckpointSelect: true });
  const result = await new PublicDatasetIngestionRunner(client, adapter().value).run({ datasets: ['demo'] });
  assert.equal(result.datasets[0].status, 'failed');
  assert.match(result.datasets[0].errors.join(' '), /runtime: checkpoint table unavailable/);
  const finalUpdate = calls.filter((call) => call.method === 'update' && call.table === 'public_dataset_runs').at(-1);
  assert.equal((finalUpdate?.payload as { status: string }).status, 'failed');
});

test('keeps other datasets when one dataset throws and supports discovery without a client', async () => {
  const { client } = fakeClient();
  let calls = 0;
  const { value } = adapter({
    loadTargetCnpjs: async () => {
      calls += 1;
      if (calls === 1) throw new Error('companies unavailable');
      return new Set(['17770708000124']);
    },
  });
  const result = await new PublicDatasetIngestionRunner(client, value).run({ datasets: ['demo', 'other'] });
  assert.equal(result.datasets.length, 2);
  assert.match(result.datasets[0].errors[0], /runtime: companies unavailable/);
  assert.equal(result.datasets[1].status, 'completed');
  assert.equal(result.status, 'partial');

  const discovered = await new PublicDatasetIngestionRunner(null, adapter().value).run({ datasets: ['demo'], discoverOnly: true });
  assert.equal(discovered.status, 'real');
  assert.equal(discovered.datasets[0].resources?.length, 2);

  const missingClient = await new PublicDatasetIngestionRunner(null, adapter().value).run({ datasets: ['demo'] });
  assert.deepEqual(missingClient.datasets[0].errors, ['no client']);
});

test('isUnchangedResource only skips scheduled runs with a matching completed checkpoint', () => {
  const previous = { status: 'completed', etag: 'e1', resource_modified_at: '2026-09-01' };
  assert.equal(isUnchangedResource('schedule', previous, { etag: 'e1', modifiedAt: '2026-09-01' }), true);
  assert.equal(isUnchangedResource('manual', previous, { etag: 'e1', modifiedAt: '2026-09-01' }), false);
  assert.equal(isUnchangedResource('schedule', previous, { etag: 'e2', modifiedAt: '2026-09-01' }), false);
  assert.equal(isUnchangedResource('schedule', previous, { etag: null, modifiedAt: null }), false);
  assert.equal(isUnchangedResource('schedule', { ...previous, status: 'failed' }, { etag: 'e1' }), false);
});
