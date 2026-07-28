import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPTCHA_ENV_KEYS,
  disableSupabaseCaptcha,
  removeVercelCaptchaEnv,
} from './retire-captcha-production.mjs';

test('Supabase CAPTCHA is disabled and verified', async () => {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    if ((init.method ?? 'GET') === 'PATCH') {
      return new Response(JSON.stringify({ security_captcha_enabled: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ security_captcha_enabled: false }), { status: 200 });
  };

  const result = await disableSupabaseCaptcha({
    projectRef: 'project-ref',
    accessToken: 'management-token',
    fetchImpl,
  });

  assert.deepEqual(result, { enabled: false });
  assert.equal(requests[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[0].body), { security_captcha_enabled: false });
  assert.equal(requests[1].method, 'GET');
});

test('Vercel CAPTCHA variables are deleted across all targets', async () => {
  const envs = [
    { id: 'env_1', key: 'VITE_CAPTCHA_ENABLED' },
    { id: 'env_2', key: 'VITE_TURNSTILE_SITE_KEY' },
    { id: 'env_3', key: 'VITE_SUPABASE_URL' },
  ];
  const deleted = [];
  let listCalls = 0;

  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    if (method === 'DELETE') {
      const id = String(url).split('/env/')[1].split('?')[0];
      deleted.push(id);
      return new Response('', { status: 204 });
    }
    listCalls += 1;
    const remaining = listCalls === 1 ? envs : envs.filter(({ id }) => !deleted.includes(id));
    return new Response(JSON.stringify({ envs: remaining }), { status: 200 });
  };

  const result = await removeVercelCaptchaEnv({
    projectId: 'project-id',
    teamId: 'team-id',
    token: 'vercel-token',
    fetchImpl,
  });

  assert.deepEqual(result.removed, ['VITE_CAPTCHA_ENABLED', 'VITE_TURNSTILE_SITE_KEY']);
  assert.deepEqual(result.remaining, []);
  assert.deepEqual(deleted.sort(), ['env_1', 'env_2']);
  assert.equal(CAPTCHA_ENV_KEYS.has('VITE_SUPABASE_URL'), false);
});
