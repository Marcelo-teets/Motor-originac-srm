import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { evaluateBudget, githubOutputLines, parseArgs } from './check-neon-storage-budget.mjs';

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
