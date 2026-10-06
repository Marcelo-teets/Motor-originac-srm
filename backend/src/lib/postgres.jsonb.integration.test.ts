import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NeonPostgresClient } from './postgres.js';

// Disposable Postgres only (local/CI service container). Never point this at
// the Motor production database: the test creates and drops a scratch table.
const url = process.env.MOTOR_TEST_POSTGRES_URL ?? '';

test('NeonPostgresClient round-trips json/jsonb and text[] values against a real Postgres', { skip: !url }, async () => {
  const client = new NeonPostgresClient(url);
  const table = `motor_jsonb_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const { Pool } = await import('pg');
  const admin = new Pool({ connectionString: url, max: 1 });

  try {
    await admin.query(`create table public.${table} (
      id text primary key,
      tags text[] not null default '{}',
      evidence jsonb not null default '[]'::jsonb,
      filter_value jsonb,
      metadata jsonb not null default '{}'::jsonb
    )`);
    await admin.query(`create function public.${table}_echo(p_records jsonb, p_label text)
      returns jsonb language sql as $$ select jsonb_build_object('records', p_records, 'label', p_label) $$`);

    await client.upsert(table, [
      { id: 'strings', evidence: ['x', 'y'], filter_value: 'FIDC', tags: ['a', 'b'] },
      { id: 'empty', evidence: [], metadata: { nested: [1, 2] } },
      { id: 'objects', evidence: [{ k: 1 }], filter_value: 42 },
    ], 'id');
    await client.update(table, { evidence: ['updated'] }, [{ column: 'id', value: 'objects' }]);

    const rows = await client.select(table, { orderBy: { column: 'id' } });
    const byId = Object.fromEntries(rows.map((row: any) => [row.id, row]));
    assert.deepEqual(byId.strings.evidence, ['x', 'y']);
    assert.equal(byId.strings.filter_value, 'FIDC');
    assert.deepEqual(byId.strings.tags, ['a', 'b']);
    assert.deepEqual(byId.empty.evidence, []);
    assert.deepEqual(byId.empty.metadata, { nested: [1, 2] });
    assert.deepEqual(byId.objects.evidence, ['updated']);
    assert.equal(byId.objects.filter_value, 42);

    const echoed = await client.rpc<Record<string, unknown>>(`${table}_echo`, { p_records: [{ id: 1 }], p_label: 'cvm' });
    assert.deepEqual(echoed, { records: [{ id: 1 }], label: 'cvm' });
  } finally {
    await admin.query(`drop function if exists public.${table}_echo(jsonb, text)`).catch(() => undefined);
    await admin.query(`drop table if exists public.${table}`).catch(() => undefined);
    await admin.end();
    await client.close();
  }
});
