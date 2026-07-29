import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import { installExpressUrlBridge, toExpressParsedUrl } from './express-url-bridge.js';

const request = (url = '/') => ({
  url,
  headers: { host: 'motor-originac-srm.vercel.app' },
}) as IncomingMessage;

test('converts a request URL using the WHATWG URL implementation', () => {
  const req = request('/integrations/microsoft/status?source=task-center');
  const parsed = toExpressParsedUrl(req.url, req);

  assert.equal(parsed.pathname, '/integrations/microsoft/status');
  assert.equal(parsed.search, '?source=task-center');
  assert.equal(parsed.query, 'source=task-center');
  assert.equal(parsed.path, '/integrations/microsoft/status?source=task-center');
  assert.equal(parsed._raw, req.url);
});

test('keeps Express parse caches synchronized after router URL rewrites', () => {
  const req = request('/api/integrations/microsoft/status?source=task-center') as IncomingMessage & {
    originalUrl?: string;
    _parsedUrl?: { pathname: string; _raw: string };
    _parsedOriginalUrl?: { pathname: string; _raw: string };
  };

  const bridged = installExpressUrlBridge(req, '/integrations/microsoft/status?source=task-center');

  assert.equal(bridged.url, '/integrations/microsoft/status?source=task-center');
  assert.equal(bridged.originalUrl, '/integrations/microsoft/status?source=task-center');
  assert.equal(bridged._parsedUrl?.pathname, '/integrations/microsoft/status');
  assert.equal(bridged._parsedOriginalUrl?.pathname, '/integrations/microsoft/status');

  bridged.url = '/status?source=task-center';

  assert.equal(bridged._parsedUrl?.pathname, '/status');
  assert.equal(bridged._parsedUrl?._raw, '/status?source=task-center');
});
