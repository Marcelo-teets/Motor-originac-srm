import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_AUTH_ENV_KEYS,
  syncPublicAuthEnvToVercel,
  validatePublicAuthConfig,
} from './sync-public-auth-env-to-vercel.mjs';

const neonProjectId = 'steep-poetry-38942951';
const neonAuthBaseUrl = 'https://ep-test.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth';
const neonAuthJwksUrl = `${neonAuthBaseUrl}/.well-known/jwks.json`;

const response = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('upserts only canonical Neon Auth variables and verifies production targets', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if ((init.method ?? 'GET') === 'POST') return response(201, { created: { id: 'env' }, failed: [] });
    return response(200, {
      envs: PUBLIC_AUTH_ENV_KEYS.map((key) => ({ key, target: ['production', 'preview', 'development'] })),
    });
  };

  const report = await syncPublicAuthEnvToVercel({
    projectId: 'prj_test',
    teamId: 'team_test',
    token: 'vercel_test_token',
    authProvider: 'neon',
    neonProjectId,
    neonAuthBaseUrl,
    neonAuthJwksUrl,
    fetchImpl,
  });

  assert.equal(report.status, 'passed');
  assert.equal(report.authProvider, 'neon');
  assert.equal(report.neonProjectId, neonProjectId);
  assert.deepEqual(report.synced.map(({ key }) => key).sort(), [...PUBLIC_AUTH_ENV_KEYS].sort());

  const posts = requests.filter(({ init }) => init.method === 'POST');
  assert.equal(posts.length, PUBLIC_AUTH_ENV_KEYS.length);
  for (const { url, init } of posts) {
    assert.match(url, /\/env\?teamId=team_test$/);
    const [body] = JSON.parse(init.body);
    assert.ok(PUBLIC_AUTH_ENV_KEYS.includes(body.key));
    assert.deepEqual(body.target, ['production', 'preview', 'development']);
    assert.equal(body.type, 'encrypted');
    assert.doesNotMatch(body.key, /SUPABASE/);
  }
});

test('validates canonical Neon Auth URLs', () => {
  const result = validatePublicAuthConfig({ authProvider: 'neon', neonProjectId, neonAuthBaseUrl, neonAuthJwksUrl });
  assert.equal(result.authProvider, 'neon');
  assert.equal(result.neonAuthBaseUrl, neonAuthBaseUrl);
  assert.equal(result.neonAuthJwksUrl, neonAuthJwksUrl);
});

test('rejects malformed Neon Auth host or JWKS URL', () => {
  assert.throws(() => validatePublicAuthConfig({
    authProvider: 'neon',
    neonProjectId,
    neonAuthBaseUrl: 'https://example.com/neondb/auth',
    neonAuthJwksUrl: 'https://example.com/neondb/auth/.well-known/jwks.json',
  }), /neon\.tech/);

  assert.throws(() => validatePublicAuthConfig({
    authProvider: 'neon',
    neonProjectId,
    neonAuthBaseUrl,
    neonAuthJwksUrl: `${neonAuthBaseUrl}/wrong`,
  }), /JWKS URL/);
});

test('fails when Vercel does not expose synchronized variables in production', async () => {
  const fetchImpl = async (_url, init = {}) => {
    if ((init.method ?? 'GET') === 'POST') return response(201, { created: { id: 'env' }, failed: [] });
    return response(200, { envs: [] });
  };

  await assert.rejects(syncPublicAuthEnvToVercel({
    projectId: 'prj_test',
    teamId: 'team_test',
    token: 'vercel_test_token',
    authProvider: 'neon',
    neonProjectId,
    neonAuthBaseUrl,
    neonAuthJwksUrl,
    fetchImpl,
  }), /not configured for Vercel production/);
});
