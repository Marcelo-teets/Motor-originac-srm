import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TABLES, assertAuditConnections, compareReadOnlyInventories,
} from './data-plane-cutover-inventory.mjs';

const sb = 'postgresql://user:secret@db.hdghpmssudrqhsbvrdyt.supabase.co:5432/postgres';
const neon = 'postgresql://user:secret@ep-fake-pooler.sa-east-1.aws.neon.tech:5432/neondb';

test('audit accepts only both explicitly specified official hosts', () => {
  assert.equal(assertAuditConnections(sb, neon).supabaseHost, 'db.hdghpmssudrqhsbvrdyt.supabase.co');
  assert.throws(() => assertAuditConnections('', neon), /Both explicit/);
  assert.throws(() => assertAuditConnections(neon, neon), /Refusing noncanonical/);
  assert.throws(() => assertAuditConnections(
    'postgres://user:pass@db.other.supabase.co:5432/postgres', neon), /Refusing noncanonical/);
  assert.throws(() => assertAuditConnections(sb,
    'postgres://user:pass@localhost:5432/neondb'), /Refusing non-Neon/);
});

test('schema differences and historical volume cannot approve a production cutover', () => {
  const base = { columns: { id: 'uuid', created_at: 'timestamp with time zone' }, count: 20, lastUpdated: null };
  const source = Object.fromEntries(TABLES.map(table => [table, { ...base, columns: { ...base.columns } }]));
  const target = Object.fromEntries(TABLES.map(table => [table, { ...base, columns: { ...base.columns }, count: 1 }]));
  target.search_profiles.columns.id = 'text';
  target.monitoring_outputs.columns.run_id = 'uuid';
  const report = compareReadOnlyInventories(source, target);
  assert.equal(report.status, 'blocked_pending_reviewed_mapping_and_human_signoff');
  assert.equal(report.cutoverApproved, false);
  assert.equal(report.readOnly, true);
  assert.equal(report.mismatchedTables, 2);
  assert.deepEqual(report.tables.find(x => x.table === 'search_profiles').changedType,
    [{ column: 'id', supabase: 'uuid', neon: 'text' }]);
  assert.deepEqual(report.tables.find(x => x.table === 'monitoring_outputs').neonOnly, ['run_id']);
  assert.equal(report.tables.find(x => x.table === 'companies').rowCounts.supabase, 20);
  assert.equal(report.tables.find(x => x.table === 'companies').rowCounts.neon, 1);
});

test('missing tables cannot be silently treated as schema-compatible', () => {
  const report = compareReadOnlyInventories({}, {});
  assert.equal(report.mismatchedTables, TABLES.length);
  assert.equal(report.cutoverApproved, false);
});

test('production reconciliation cannot write to either database or expose row contents', () => {
  const source = readFileSync(new URL('./data-plane-cutover-inventory.mjs', import.meta.url), 'utf8');
  assert.match(source, /BEGIN TRANSACTION READ ONLY/);
  assert.match(source, /information_schema\.columns/);
  assert.match(source, /select count\(\*\)::bigint as n/);
  assert.match(source, /MOTOR_SUPABASE_AUDIT_DATABASE_URL/);
  assert.match(source, /MOTOR_NEON_DATABASE_URL/);
  assert.doesNotMatch(source, /\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\b|\bCREATE TABLE\b|\bDROP TABLE\b/i);
  assert.doesNotMatch(source, /return\s+result\.rows|console\.log\(connectionString\)/);
});
