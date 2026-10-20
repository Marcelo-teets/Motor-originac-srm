import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./vercel-health-smoke.mjs', import.meta.url));
const requiredTables = [
  'companies', 'source_catalog', 'source_connector_runs',
  'monitoring_outputs', 'company_signals', 'qualification_snapshots',
  'lead_score_snapshots', 'pipeline',
];

const smokeEnv = (overrides = {}) => ({
  ...process.env,
  SMOKE_BEARER_TOKEN: '',
  SMOKE_UNAUTHENTICATED_ONLY: '',
  SMOKE_ATTEMPTS: '1',
  SMOKE_DELAY_MS: '0',
  EXPECTED_DATA_PROVIDER: 'neon',
  SMOKE_URL: 'http://127.0.0.1:9/api/data-capture/health',
  ...overrides,
});

const runSmoke = (env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
});

const withHealthServer = async (handler, exercise) => {
  const server = createServer((req, res) => {
    const [status, body] = handler(req);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    return await exercise('http://127.0.0.1:' + address.port + '/api/data-capture/health');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

const unauthorized = [401, { status: 'partial', error: 'Missing bearer token.' }];
const healthy = {
  status: 'real',
  captureRuntime: { canRunAgainstDatabase: true, coreTablesAccessible: true },
  env: { dataProvider: 'neon' },
  tables: requiredTables.map((table) => ({ table, ok: true, count: 1 })),
};

test('missing authenticated smoke token fails closed before network access', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    timeout: 4000,
    env: smokeEnv(),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /SMOKE_BEARER_TOKEN is required/);
  assert.doesNotMatch(result.stdout, /"ok": true/);
});

test('explicit 401-only smoke is allowed and labeled as skipped authenticated diagnostics', async () => {
  await withHealthServer(() => unauthorized, async (url) => {
    const result = await runSmoke(smokeEnv({
      SMOKE_URL: url,
      SMOKE_UNAUTHENTICATED_ONLY: 'true',
    }));
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /skipped_missing_SMOKE_BEARER_TOKEN/);
  });
});

test('authenticated smoke verifies the real database and every required table', async () => {
  let anonymous = 0;
  let authorized = 0;
  await withHealthServer((req) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      anonymous += 1;
      return unauthorized;
    }
    authorized += 1;
    return [200, healthy];
  }, async (url) => {
    const result = await runSmoke(smokeEnv({ SMOKE_URL: url, SMOKE_BEARER_TOKEN: 'test-token' }));
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /"authenticatedDiagnostics": true/);
  });
  assert.equal(anonymous, 1);
  assert.equal(authorized, 1);
});

test('authenticated smoke fails when core database connectivity is unhealthy', async () => {
  await withHealthServer((req) => req.headers.authorization
    ? [200, { ...healthy, captureRuntime: { ...healthy.captureRuntime, canRunAgainstDatabase: false } }]
    : unauthorized, async (url) => {
    const result = await runSmoke(smokeEnv({ SMOKE_URL: url, SMOKE_BEARER_TOKEN: 'test-token' }));
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Runtime is not connected to the database/);
  });
});

test('authenticated smoke fails when required operational tables are missing', async () => {
  await withHealthServer((req) => req.headers.authorization
    ? [200, { ...healthy, tables: healthy.tables.filter((item) => item.table !== 'pipeline') }]
    : unauthorized, async (url) => {
    const result = await runSmoke(smokeEnv({ SMOKE_URL: url, SMOKE_BEARER_TOKEN: 'test-token' }));
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Missing table check: pipeline/);
  });
});
