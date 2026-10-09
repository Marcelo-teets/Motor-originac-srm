import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { ESTIMATED_BYTES_PER_INGESTED_ROW, evaluateBudget, githubOutputLines, headroomRows, parseArgs } from './check-neon-storage-budget.mjs';

test('parses the legacy CLI contract', () => {
  assert.deepEqual(parseArgs(['--requested-rows=500', '--trigger=backfill']), { requestedRows: 500, triggerType: 'backfill' });
  assert.deepEqual(parseArgs([]), { requestedRows: 0, triggerType: 'manual' });
});

test('maps the Neon growth guard to the preflight decision', () => {
  const healthy = evaluateBudget({ guard: { status: 'normal', current_bytes: 123_450_000 }, requestedRows: 500, triggerType: 'manual' });
  assert.deepEqual([healthy.state, healthy.effectiveRows, healthy.blocked, healthy.capped, healthy.databaseMb], ['healthy', 500, false, false, 123.45]);

  const degraded = evaluateBudget({ guard: { status: 'degraded' }, requestedRows: 20_000, triggerType: 'schedule' });
  assert.deepEqual([degraded.state, degraded.effectiveRows, degraded.capped], ['degraded', 2_000, true]);

  const backfill = evaluateBudget({ guard: { status: 'degraded' }, requestedRows: 20_000, triggerType: 'backfill' });
  assert.equal(backfill.blocked, true);

  const blocked = evaluateBudget({ guard: { status: 'block_raw' }, requestedRows: 10, triggerType: 'manual' });
  assert.deepEqual([blocked.state, blocked.blocked], ['blocked', true]);

  const unknown = evaluateBudget({ guard: null, requestedRows: 1, triggerType: 'manual' });
  assert.equal(unknown.blocked, true);
});

test('caps rows by the bytes left before the next guard threshold', () => {
  // 09/10/2026 baseline: 21 MB used, soft limit 400 MB → ~94k rows, not 50k per dataset forever.
  const guard = { status: 'normal', current_bytes: 21_000_000, soft_limit_bytes: 400_000_000, hard_limit_bytes: 440_000_000 };
  const early = evaluateBudget({ guard, requestedRows: 20_000, triggerType: 'manual' });
  assert.equal(early.effectiveRows, 20_000);
  assert.equal(early.headroomRows, Math.floor((400_000_000 - 21_000_000) / ESTIMATED_BYTES_PER_INGESTED_ROW));

  const nearSoft = evaluateBudget({ guard: { ...guard, current_bytes: 390_000_000 }, requestedRows: 20_000, triggerType: 'manual' });
  assert.deepEqual([nearSoft.effectiveRows, nearSoft.capped], [2_500, true]);

  const degraded = evaluateBudget({ guard: { ...guard, status: 'degraded', current_bytes: 439_000_000 }, requestedRows: 20_000, triggerType: 'schedule' });
  assert.deepEqual([degraded.effectiveRows, degraded.capped], [250, true]);

  assert.equal(headroomRows({ current_bytes: 455_344_128, hard_limit_bytes: 440_000_000 }, 'block_raw'), 0);
  assert.equal(headroomRows({ status: 'normal' }, 'normal'), null);
});

test('writes every GITHUB_OUTPUT key consumed by the workflows', () => {
  const lines = githubOutputLines(evaluateBudget({ guard: { status: 'normal' }, requestedRows: 5, triggerType: 'manual' }));
  for (const key of ['state', 'database_mb', 'allowed_rows', 'requested_rows', 'effective_rows', 'trigger', 'blocked', 'capped']) {
    assert.match(lines, new RegExp(`^${key}=`, 'm'));
  }
});

test('no workflow references the removed legacy preflight script', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const content = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(content, /check-supabase-storage-budget/, file);
  }
});
