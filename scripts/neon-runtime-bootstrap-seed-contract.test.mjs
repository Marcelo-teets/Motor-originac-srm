import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('../db/neon/20261001_neon_runtime_bootstrap_seed.sql', import.meta.url),
  'utf8',
);

test('Neon bootstrap seeds only operational configuration, never synthetic companies', () => {
  assert.match(sql, /insert into public\.source_catalog/i);
  assert.match(sql, /insert into public\.pattern_catalog/i);
  assert.match(sql, /insert into public\.search_profiles/i);
  assert.doesNotMatch(sql, /insert into public\.companies/i);
  assert.doesNotMatch(sql, /Neon Receivables|Orbit Pay|Axon Health/i);
});

test('Neon bootstrap aligns with UUID source/pattern schema', () => {
  assert.match(sql, /::uuid/);
  assert.match(sql, /on conflict \(code\) do update/i);
  assert.match(sql, /metadata.*"code"/is);
});

test('Neon bootstrap keeps Brazil-only and minimum 50 employee ICP', () => {
  assert.match(sql, /'Brasil'/);
  assert.match(sql, /min_employee_count/);
  assert.match(sql, /50/);
});

test('Neon bootstrap preserves DCM/FIDC origination focus', () => {
  for (const token of ['FIDC','Warehouse','Nota Comercial','Debênture','funding_gap','receivables']) {
    assert.match(sql, new RegExp(token, 'i'));
  }
});
