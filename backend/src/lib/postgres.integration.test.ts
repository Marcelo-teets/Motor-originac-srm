import assert from 'node:assert/strict';
import test from 'node:test';
import { NeonPostgresClient } from './postgres.js';

const url = process.env.MOTOR_NEON_DATABASE_URL ?? '';

test('NeonPostgresClient reaches Motor Neon and reads canonical runtime tables', { skip: !url }, async () => {
  const client = new NeonPostgresClient(url);
  const health = await client.health();
  assert.equal(health.database, 'neondb');

  const sources = await client.select('source_catalog', {
    select: 'id,name,status,health',
    orderBy: { column: 'name', ascending: true },
    limit: 20,
  });
  assert.ok(sources.length >= 5);
  assert.ok(sources.some((row: any) => row.name === 'BrasilAPI CNPJ'));
  assert.ok(sources.some((row: any) => row.name === 'CVM'));

  const companies = await client.select('companies', { select: 'id', limit: 1 });
  assert.ok(Array.isArray(companies));
});

// Opt-in local check: point MOTOR_TEST_POSTGRES_URL at a disposable database.
const localUrl = process.env.MOTOR_TEST_POSTGRES_URL ?? '';

test('NeonPostgresClient.rpc forwards named arguments to the SQL function', { skip: !localUrl }, async () => {
  const client = new NeonPostgresClient(localUrl);
  await client.query('create or replace function public.motor_rpc_probe(p_x int, p_label text) returns text language sql as $$ select p_label || \':\' || (p_x + 1) $$');
  try {
    assert.equal(await client.rpc<string>('motor_rpc_probe', { p_x: 41, p_label: 'answer' }), 'answer:42');
    assert.equal(
      await client.rpcAsUser<string>('motor_rpc_probe', { p_label: 'user', p_x: 1 }, { id: '00000000-0000-4000-8000-000000000001' }),
      'user:2',
    );
  } finally {
    await client.query('drop function if exists public.motor_rpc_probe(int, text)');
  }
});
