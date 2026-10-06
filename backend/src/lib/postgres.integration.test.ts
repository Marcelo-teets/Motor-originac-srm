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
