import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MIGRATIONS } from './lib/neon-migration-plan.mjs';

const file = 'db/neon/20261009_neon_cvm_fre_headcount_sync.sql';
const sql = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const gate = await readFile(new URL('../db/neon/20261007_neon_origination_decision_gates.sql', import.meta.url), 'utf8');

test('FRE headcount sync writes exactly what the ICP gate reads', () => {
  // The gate reads employee_count, observed, confidence >= 0.60, observed_at within 365 days.
  assert.match(gate, /lower\(m\.metric_key\) in \('employee_count'/);
  assert.match(sql, /insert into public\.company_source_metric_snapshots/);
  assert.match(sql, /'employee_count'/);
  assert.match(sql, /'observed'/);
  assert.match(sql, /0\.95/);
  assert.match(sql, /l\.reference_date::timestamptz/);
});

test('FRE headcount sync sums rows per document/version and keeps the latest form per CNPJ', () => {
  assert.match(sql, /measurement_scope like 'fre_empregado_genero:%'/);
  assert.match(sql, /group by cnpj, reference_date, document_id, version/);
  assert.match(sql, /distinct on \(cnpj\)/);
  assert.match(sql, /order by cnpj, reference_date desc, version desc/);
  assert.match(sql, /on conflict \(company_id, source_id, metric_key, observed_at\)/);
});

test('FRE headcount sync is service-role only and registered in the Neon migration plan', () => {
  assert.match(sql, /security invoker/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.sync_cvm_fre_headcount_metrics\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.sync_cvm_fre_headcount_metrics\(\) to service_role/);
  assert.ok(MIGRATIONS.includes(file));
});
