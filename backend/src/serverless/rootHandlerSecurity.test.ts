import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as rootHandlerModule from '../../../api/index.js';

const importedRootHandler = rootHandlerModule.default as unknown as { default?: unknown } | unknown;
const rootHandler = ((importedRootHandler as { default?: unknown })?.default ?? importedRootHandler) as (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

test('published root handler protects capture diagnostics', async () => {
  process.env.CRON_SECRET = 'root-handler-test-secret';
  const request = {
    url: '/api/data-capture/health',
    headers: { host: 'localhost' },
  } as unknown as IncomingMessage;
  const captured: { statusCode: number; payload?: any } = { statusCode: 0 };
  const response = {
    writeHead(statusCode: number) {
      captured.statusCode = statusCode;
      return response;
    },
    end(body?: string) {
      captured.payload = body ? JSON.parse(body) : undefined;
    },
  } as unknown as ServerResponse;

  await rootHandler(request, response);

  assert.equal(captured.statusCode, 401);
  assert.equal(captured.payload?.tables, undefined);
  assert.equal(captured.payload?.env, undefined);
});
