import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runFidcAuditAccessSmoke } from './smoke-fidc-audit-access.mjs';

const serve = async ({ status = 401, contentType = 'application/json', body = { status: 'partial', error: 'unauthorized' } } = {}) => {
  const observed = [];
  const server = createServer(async (req, res) => {
    let bytes = '';
    for await (const chunk of req) bytes += chunk;
    observed.push({ method: req.method, url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie, body: bytes });
    res.writeHead(status, { 'content-type': contentType });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    server, observed, baseUrl: `http://127.0.0.1:${address.port}`,
    async close() { server.close(); await once(server, 'close'); },
  };
};

test('FIDC production smoke verifies 401 on all four endpoints without credentials or real writes', async () => {
  const mock = await serve();
  try {
    const result = await runFidcAuditAccessSmoke({ baseUrl: mock.baseUrl });
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.checks.map((check) => check.check), [
      'cvm-source-list', 'fidc-latest-reviews', 'fidc-review-history', 'fidc-review-write',
    ]);
    assert.deepEqual(mock.observed.map((x) => x.method), ['GET', 'GET', 'GET', 'POST']);
    assert.ok(mock.observed.every((x) => x.authorization === undefined && x.cookie === undefined));
    assert.equal(mock.observed[3].body, '{}');
  } finally { await mock.close(); }
});

test('FIDC production smoke fails closed if unauthenticated endpoint leaks live data', async () => {
  const mock = await serve({ status: 200, body: { data: [{ cnpj: '12345678000190' }] } });
  try {
    await assert.rejects(runFidcAuditAccessSmoke({ baseUrl: mock.baseUrl }), /HTTP 401, got 200/);
  } finally { await mock.close(); }
});

test('FIDC production smoke rejects SPA HTML masquerading as an API error', async () => {
  const mock = await serve({ status: 401, contentType: 'text/html', body: '<html>Login</html>' });
  try {
    await assert.rejects(runFidcAuditAccessSmoke({ baseUrl: mock.baseUrl }), /must be JSON/);
  } finally { await mock.close(); }
});

test('FIDC production smoke rejects unauthorized payloads that include reviewer details', async () => {
  const mock = await serve({ status: 401, body: { error: 'unauthorized', reviewer_email: 'private@example.com' } });
  try {
    await assert.rejects(runFidcAuditAccessSmoke({ baseUrl: mock.baseUrl }), /leaked reviewer_email/);
  } finally { await mock.close(); }
});
