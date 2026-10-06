import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test, { before } from 'node:test';

// Contract tests for the real Vercel dispatcher (api/index.ts). They replace the
// tests of the removed backend/src/serverless/vercelServerlessHandler.ts copy.
// Lives outside api/ because every api/*.ts file is a billable Vercel Function.
for (const key of ['MOTOR_NEON_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']) {
  delete process.env[key];
}
process.env.CRON_SECRET = 'test-secret';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
let handler: Handler;
before(async () => {
  // Dynamic import: this file compiles as CommonJS (no top-level await) and the
  // env above must be in place before the dispatcher loads backend modules.
  const mod = await import('../api/index.js') as { default: unknown };
  // ESM interop yields the function; CommonJS interop wraps module.exports.
  const exported = mod.default as Handler | { default: Handler };
  handler = typeof exported === 'function' ? exported : exported.default;
});

const request = (path: string, headers: Record<string, string> = {}) => ({
  url: path,
  method: 'GET',
  headers: { host: 'localhost', ...headers },
}) as unknown as IncomingMessage;

const response = () => {
  const captured: { statusCode: number; payload: any } = { statusCode: 0, payload: null };
  const res = {
    writeHead(statusCode: number) {
      captured.statusCode = statusCode;
      return res;
    },
    end(body?: string) {
      captured.payload = body ? JSON.parse(body) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
};

test('data-capture/health is closed without the cron credential', async () => {
  const { res, captured } = response();
  await handler(request('/api/data-capture/health'), res);
  assert.equal(captured.statusCode, 401);
  assert.equal(captured.payload.status, 'partial');
  assert.equal(captured.payload.tables, undefined);
  assert.equal(captured.payload.env, undefined);
});

test('data-capture/health rejects a wrong credential', async () => {
  const { res, captured } = response();
  await handler(request('/api/data-capture/health', { authorization: 'Bearer wrong-secret' }), res);
  assert.equal(captured.statusCode, 401);
  assert.equal(captured.payload.tables, undefined);
});

test('data-capture/health returns diagnostics for the authorized runtime', async () => {
  const { res, captured } = response();
  await handler(request('/api/data-capture/health', { authorization: 'Bearer test-secret' }), res);
  assert.equal(captured.statusCode, 207);
  assert.equal(captured.payload.status, 'partial');
  assert.equal(captured.payload.env.dataProvider, 'memory');
  assert.ok(Array.isArray(captured.payload.tables));
  assert.ok(captured.payload.tables.every((table: { ok: boolean }) => table.ok === false));
  assert.equal(captured.payload.captureRuntime.queryTimeoutMs, 4_000);
});

test('cron runtimes stay closed without the credential', async () => {
  for (const path of ['/api/data-capture/run', '/api/data-capture/cron/run', '/api/search-profiles/cron/run']) {
    const { res, captured } = response();
    await handler(request(path, { authorization: 'Bearer nope' }), res);
    assert.equal(captured.statusCode, 401, path);
  }
});

test('origination routes answer from the static operating-system module', async () => {
  const { res, captured } = response();
  await handler(request('/api/origination/os'), res);
  assert.equal(captured.statusCode, 200);
  assert.equal(captured.payload.status, 'real');

  const missing = response();
  await handler(request('/api/origination/unknown'), missing.res);
  assert.equal(missing.captured.statusCode, 404);
});
