import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createVercelServerlessHandler } from './vercelServerlessHandler.js';

type CapturedResponse = {
  statusCode: number;
  payload: any;
};

const buildRequest = (path: string, headers: Record<string, string> = {}) =>
  ({
    url: path,
    headers: { host: 'localhost', ...headers },
  }) as unknown as IncomingMessage;

const buildResponse = () => {
  const captured: CapturedResponse = { statusCode: 0, payload: null };
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
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

test('data-capture/health rejects requests without runtime credential', async () => {
  process.env.CRON_SECRET = 'test-secret';
  const handler = createVercelServerlessHandler();
  const { res, captured } = buildResponse();

  await handler(buildRequest('/api/data-capture/health'), res);

  assert.equal(captured.statusCode, 401);
  assert.equal(captured.payload.status, 'partial');
  assert.equal(captured.payload.tables, undefined);
  assert.equal(captured.payload.env, undefined);
});

test('data-capture/health rejects requests with wrong credential', async () => {
  process.env.CRON_SECRET = 'test-secret';
  const handler = createVercelServerlessHandler();
  const { res, captured } = buildResponse();

  await handler(buildRequest('/api/data-capture/health', { authorization: 'Bearer wrong-secret' }), res);

  assert.equal(captured.statusCode, 401);
  assert.equal(captured.payload.tables, undefined);
});

test('data-capture/health returns full diagnostics for authorized runtime', async () => {
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  const handler = createVercelServerlessHandler();
  const { res, captured } = buildResponse();

  await handler(buildRequest('/api/data-capture/health', { authorization: 'Bearer test-secret' }), res);

  assert.ok([200, 207].includes(captured.statusCode));
  assert.ok(Array.isArray(captured.payload.tables));
  assert.ok(captured.payload.captureRuntime);
});
