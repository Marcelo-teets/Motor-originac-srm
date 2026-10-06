import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { calculateCrc32 } from '../lib/zipArchive.js';
import {
  AgentetomeError,
  assertDownloadUrl,
  parseAgentetomeArchive,
  parseCsv,
  runAdminExport,
  runDueExports,
  validateExportRequest,
  type DataClient,
} from './agentetomePipeline.js';

const zip = (files: Record<string, string>) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(data);
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = calculateCrc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
};

const CSV = 'cnpj_fundo,data_posicao,valor\n"12.345.678/0001-90",2026-09-30,"1,5"\n12345678000190,2026-09-30,2\n';

test('parseCsv handles quotes, BOM and CRLF', () => {
  const parsed = parseCsv('﻿a,b\r\n"x, ""y""",2\r\n');
  assert.deepEqual(parsed.headers, ['a', 'b']);
  assert.deepEqual(parsed.rows, [{ a: 'x, "y"', b: '2' }]);
});

test('parseAgentetomeArchive keeps the legacy bronze lineage contract', () => {
  const bytes = zip({ 'fidc_consolidado.csv': CSV });
  const parsed = parseAgentetomeArchive({
    zipBytes: bytes,
    expectedSize: bytes.length,
    expectedRows: { 'fidc_consolidado.csv': { linhas: 2 } },
    sourceUrl: 'agentetome://not_persisted/x.zip',
    schemaVersion: 1,
  });
  assert.equal(parsed.fileCount, 1);
  assert.deepEqual(parsed.rowCounts, { 'fidc_consolidado.csv': 2 });
  const [first] = parsed.bronzeRows;
  assert.equal(first.dataset_code, 'agentetome_fidc_consolidado_v1');
  assert.equal(first.record_key, 'fidc_consolidado.csv:line=1');
  assert.equal(first.entity_cnpj, '12345678000190');
  assert.equal(first.ref_date, '2026-09-30');
  assert.equal(first.source_url, 'agentetome://not_persisted/x.zip#fidc_consolidado.csv');
  assert.equal((first.payload._lineage as { package_hash: string }).package_hash, parsed.packageHash);

  assert.throws(() => parseAgentetomeArchive({ zipBytes: bytes, expectedRows: { 'fidc_consolidado.csv': 3 }, sourceUrl: 'x', schemaVersion: 1 }), /row_count_mismatch/);
  assert.throws(() => parseAgentetomeArchive({ zipBytes: bytes, expectedRows: { 'outro.csv': 1 }, sourceUrl: 'x', schemaVersion: 1 }), /missing_expected_file/);
  assert.throws(() => parseAgentetomeArchive({ zipBytes: bytes, expectedSize: 1, expectedRows: {}, sourceUrl: 'x', schemaVersion: 1 }), /size_mismatch/);
});

test('request validation and download URL allow-list', () => {
  assert.deepEqual(validateExportRequest({ admin: ' Oliveira Trust ' }), { admin: 'Oliveira Trust', cut: 'recente', competence: null, format: 'csv' });
  assert.throws(() => validateExportRequest({ admin: 'x', cut: 'competencia', competence: '2026-1' }), AgentetomeError);
  assert.throws(() => validateExportRequest({ admin: '' }), /admin_required/);
  assert.ok(assertDownloadUrl('https://www.agentetome.com/api/export/download?t=abc'));
  assert.throws(() => assertDownloadUrl('https://evil.example/api/export/download?t=abc'), /invalid_agentetome_download_url/);
  assert.throws(() => assertDownloadUrl('https://www.agentetome.com/api/export/download'), /invalid_agentetome_download_url/);
});

type Call = { method: string; name: string; payload?: unknown };

const fakeClient = (options: { existingParsed?: boolean } = {}) => {
  const calls: Call[] = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ method: 'rpc', name, payload: args });
      if (name === 'record_agentetome_export_attempt') return { status: args.p_status, sourceId: '00000000-0000-4000-a000-000000000001' };
      if (name === 'claim_due_agentetome_targets') return [{ administrator: 'oliveira trust', cut: 'recente', competence: null, format: 'csv', trigger_type: 'scheduled' }];
      return { status: 'ok' };
    },
    async select(table: string) {
      calls.push({ method: 'select', name: table });
      return options.existingParsed ? [{ id: 'pkg-1', status: 'parsed' }] : [];
    },
    async insert(table: string, rows: unknown[]) {
      calls.push({ method: 'insert', name: table, payload: rows });
      return rows;
    },
    async upsert(table: string, rows: unknown[]) {
      calls.push({ method: 'upsert', name: table, payload: rows });
      return table === 'agentetome_export_packages' ? [{ id: 'pkg-new' }] : rows;
    },
    async update(table: string, payload: unknown) {
      calls.push({ method: 'update', name: table, payload });
      return [];
    },
  };
  return { client: client as unknown as DataClient, calls };
};

const providerFetch = (bytes: Buffer, overrides: { exportStatus?: number } = {}) => (async (input: URL | string, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.pathname === '/api/mcp') {
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer key-1');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.params.name, 'exportar_admin');
    const text = JSON.stringify({
      manifest: { schema_versao: 1, gerado_em: '2026-10-06T10:00:00Z', arquivos: { 'fidc_consolidado.csv': { linhas: 2 } } },
      link_download: 'https://www.agentetome.com/api/export/download?t=signed',
      tamanho_bytes: bytes.length,
      arquivo: 'oliveira.zip',
      expira_em: '2999-01-01T00:00:00Z',
    });
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: { content: [{ type: 'text', text }] } }), { status: overrides.exportStatus ?? 200 });
  }
  if (url.pathname === '/api/export/download') return new Response(bytes, { status: 200, headers: { 'content-type': 'application/zip' } });
  throw new Error(`unexpected ${url}`);
}) as typeof fetch;

test('runAdminExport persists a new package, bronze rows and finalizes it', async () => {
  const bytes = zip({ 'fidc_consolidado.csv': CSV });
  const { client, calls } = fakeClient();
  const result = await runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv', triggerType: 'manual', requestedBy: 'u1' }, { client, apiKey: 'key-1', fetchImpl: providerFetch(bytes) });
  assert.equal(result.status, 'real');
  assert.equal(result.packageId, 'pkg-new');
  assert.equal(result.bronzeRowsWritten, 2);
  const names = calls.map((call) => `${call.method}:${call.name}`);
  assert.deepEqual(names, [
    'rpc:record_agentetome_export_attempt',
    'select:agentetome_export_packages',
    'insert:source_connector_runs',
    'upsert:agentetome_export_packages',
    'upsert:bronze_historical_records',
    'rpc:finalize_agentetome_direct_package_v2',
  ]);
  const pkg = (calls.find((call) => call.name === 'agentetome_export_packages' && call.method === 'upsert')?.payload as Array<Record<string, unknown>>)[0];
  assert.equal(pkg.storage_bucket, 'not_persisted');
  assert.equal(JSON.stringify(pkg).includes('signed'), false);
});

test('runAdminExport reuses an already parsed package idempotently', async () => {
  const bytes = zip({ 'fidc_consolidado.csv': CSV });
  const { client, calls } = fakeClient({ existingParsed: true });
  const result = await runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv' }, { client, apiKey: 'key-1', fetchImpl: providerFetch(bytes) });
  assert.equal(result.mode, 'idempotent_existing_package');
  assert.ok(calls.some((call) => call.name === 'refresh_agentetome_existing_package'));
  assert.equal(calls.some((call) => call.name === 'source_connector_runs'), false);
});

test('runAdminExport records provider failures instead of throwing', async () => {
  const bytes = zip({ 'fidc_consolidado.csv': CSV });
  const { client, calls } = fakeClient();
  const result = await runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv', triggerType: 'scheduled' }, { client, apiKey: 'key-1', fetchImpl: providerFetch(bytes, { exportStatus: 503 }) });
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'request_export');
  const failure = calls.filter((call) => call.name === 'record_agentetome_export_attempt').at(-1)?.payload as Record<string, unknown>;
  assert.equal(failure.p_status, 'failed');
  assert.equal(failure.p_http_status, 503);
  assert.equal(failure.p_trigger_type, 'scheduled');
});

test('runAdminExport refuses to run without the provider key and records nothing', async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(
    runAdminExport({ admin: 'oliveira trust', cut: 'recente', competence: null, format: 'csv' }, { client, apiKey: '', fetchImpl: providerFetch(zip({ 'a.csv': 'x\n1\n' })) }),
    (error: AgentetomeError) => error.statusCode === 503 && /AGENTETOME_API_KEY/.test(error.message),
  );
  assert.equal(calls.length, 0);
  const due = await runDueExports({ client, apiKey: '' }, 1);
  assert.equal(due.status, 'blocked');
  assert.equal(calls.length, 0);
});

test('runDueExports processes the claimed targets with their trigger type', async () => {
  const bytes = zip({ 'fidc_consolidado.csv': CSV });
  const { client, calls } = fakeClient();
  const summary = await runDueExports({ client, apiKey: 'key-1', fetchImpl: providerFetch(bytes) }, 1);
  assert.equal(summary.targetsProcessed, 1);
  assert.equal(summary.results[0].status, 'real');
  const attempt = calls.find((call) => call.name === 'record_agentetome_export_attempt')?.payload as Record<string, unknown>;
  assert.equal(attempt.p_trigger_type, 'scheduled');
});
