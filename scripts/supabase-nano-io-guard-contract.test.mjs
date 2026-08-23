import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../db/migrations/20260823215000_supabase_nano_io_guard.sql', import.meta.url);
const sql = await readFile(migrationPath, 'utf8');

const requiredSnippets = [
  "'historical-excel-reconcile'",
  "schedule := '37 */6 * * *'",
  "'historical-excel-queue'",
  "schedule := '13 5 * * *'",
  "'historical-excel-maintenance'",
  "schedule := '20 6 * * *'",
  "'agentetome-due-export-refresh'",
  "schedule := '27 */6 * * *'",
  "'origination-derived-reprocessing'",
  "schedule := '2,32 * * * *'",
  "process_origination_reprocessing_queue(10)",
  "'candidate-automatic-entity-resolution'",
  "schedule := '9 * * * *'",
  "auto_resolve_verified_candidate_entities_v4(15)",
  'create or replace function public.supabase_nano_io_guard_status()',
  'grant execute on function public.supabase_nano_io_guard_status()\n  to service_role;',
];

test('Supabase Nano IO guard keeps the bounded zero-cost cron profile', () => {
  for (const snippet of requiredSnippets) {
    assert.ok(sql.includes(snippet), `missing Nano IO guard contract: ${snippet}`);
  }
});

test('Supabase Nano IO guard does not reintroduce aggressive cron/batch settings', () => {
  assert.equal(sql.includes("schedule := '*/5 * * * *'"), false);
  assert.equal(sql.includes("schedule := '*/15 * * * *'"), false);
  assert.equal(sql.includes('process_origination_reprocessing_queue(25)'), false);
  assert.equal(sql.includes('auto_resolve_verified_candidate_entities_v4(50)'), false);
});

test('Supabase Nano IO guard is non-destructive', () => {
  assert.equal(/\bdelete\s+from\b/i.test(sql), false);
  assert.equal(/\btruncate\b/i.test(sql), false);
  assert.equal(/\bdrop\s+table\b/i.test(sql), false);
});
