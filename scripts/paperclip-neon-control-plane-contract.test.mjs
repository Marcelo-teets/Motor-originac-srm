import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [migration, endpoint, multiplexer, frontend, vercel] = await Promise.all([
  read('db/neon/20261007_neon_paperclip_control_plane.sql'),
  read('serverless/paperclip-control-plane.ts'),
  read('api/dcm-daily-operating-loop.ts'),
  read('frontend/src/lib/api.ts'),
  read('vercel.json'),
]);

test('Paperclip reuses engine_requests rather than creating a parallel queue', () => {
  assert.match(migration, /alter table public\.engine_requests/);
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /attempt_count/);
  assert.match(migration, /lease_expires_at/);
  assert.doesNotMatch(migration, /create table .*paperclip_commands/i);
  assert.match(endpoint, /engine_requests/);
  assert.match(endpoint, /ai_agent_runs/);
});

test('Paperclip actions are allowlisted, durable and never auto-send outreach', () => {
  assert.match(endpoint, /const ACTIONS = new Set/);
  assert.match(endpoint, /recompute_company/);
  assert.match(endpoint, /process_reprocessing_queue/);
  assert.match(endpoint, /create_task/);
  assert.match(endpoint, /idempotencyKey/);
  assert.match(endpoint, /Paperclip command exhausted retry attempts/);
  assert.match(endpoint, /autoSend: false/);
  assert.doesNotMatch(endpoint, /sendLead|actual_message|outreach_status:\s*'sent'/);
});

test('Paperclip shares the existing DCM Vercel function and frontend calls the real route', () => {
  assert.match(multiplexer, /view === 'paperclip'/);
  assert.match(vercel, /\/api\/origination\/paperclip/);
  assert.match(vercel, /dcm-daily-operating-loop\?view=paperclip/);
  assert.doesNotMatch(vercel, /api\/paperclip\.ts/);
  assert.match(frontend, /'\/origination\/paperclip'/);
});
