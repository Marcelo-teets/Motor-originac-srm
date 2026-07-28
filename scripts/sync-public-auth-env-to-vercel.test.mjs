import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_AUTH_ENV_KEYS,
  syncPublicAuthEnvToVercel,
  validatePublicAuthConfig,
} from './sync-public-auth-env-to-vercel.mjs';

const projectRef = 'hdghpmssudrqhsbvrdyt';
const supabaseUrl = `https://${projectRef}.supabase.co`;
const publishableKey = 'sb_publishable_test_public_key';

const response = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('upserts only public Supabase Auth variables and verifies production targets', async () => {
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
    projectRef,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.synced.map(({ key }) => key).sort(), [...PUBLIC_AUTH_ENV_KEYS].sort());

  const posts = requests.filter(({ init }) => init.method === 'POST');
  assert.equal(posts.length, 3);
  for (const { url, init } of posts) {
    assert.match(url, /upsert=true/);
    const body = JSON.parse(init.body);
    assert.ok(PUBLIC_AUTH_ENV_KEYS.includes(body.key));
    assert.deepEqual(body.target, ['production', 'preview', 'development']);
    assert.equal(body.type, 'encrypted');
    assert.notEqual(body.value, 'service_role');
  }

  const postedKeys = posts.map(({ init }) => JSON.parse(init.body).key).sort();
  assert.deepEqual(postedKeys, [...PUBLIC_AUTH_ENV_KEYS].sort());
});

test('rejects a Supabase URL from another project', () => {
  assert.throws(() => validatePublicAuthConfig({
    projectRef,
    supabaseUrl: 'https://wrong-project.supabase.co',
    publishableKey,
  }), /must target/);
});

test('rejects secret Supabase keys from the frontend configuration', () => {
  assert.throws(() => validatePublicAuthConfig({
    projectRef,
    supabaseUrl,
    publishableKey: 'sb_secret_never_public',
  }), /cannot be exposed/);
});

test('fails when Vercel does not expose the variables in production after upsert', async () => {
  const fetchImpl = async (_url, init = {}) => {
    if ((init.method ?? 'GET') === 'POST') return response(201, { created: { id: 'env' }, failed: [] });
    return response(200, { envs: [] });
  };

  await assert.rejects(syncPublicAuthEnvToVercel({
    projectId: 'prj_test',
    teamId: 'team_test',
    token: 'vercel_test_token',
    projectRef,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  }), /not configured for Vercel production/);
});
