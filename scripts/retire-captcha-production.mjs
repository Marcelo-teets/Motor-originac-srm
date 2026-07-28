import { pathToFileURL } from 'node:url';

export const CAPTCHA_ENV_KEYS = new Set([
  'VITE_CAPTCHA_ENABLED',
  'VITE_CAPTCHA_PROVIDER',
  'VITE_CAPTCHA_SITE_KEY',
  'VITE_AUTH_CAPTCHA_ENABLED',
  'VITE_AUTH_CAPTCHA_PROVIDER',
  'VITE_AUTH_CAPTCHA_SITE_KEY',
  'VITE_SUPABASE_CAPTCHA_ENABLED',
  'VITE_SUPABASE_CAPTCHA_PROVIDER',
  'VITE_SUPABASE_CAPTCHA_SITE_KEY',
  'VITE_TURNSTILE_SITE_KEY',
  'VITE_HCAPTCHA_SITE_KEY',
]);

const readJson = async (response, label) => {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  return payload;
};

export const disableSupabaseCaptcha = async ({ projectRef, accessToken, fetchImpl = fetch }) => {
  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF is required.');
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required.');

  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  await readJson(await fetchImpl(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ security_captcha_enabled: false }),
  }), 'Supabase Auth CAPTCHA update');

  const config = await readJson(await fetchImpl(url, { headers }), 'Supabase Auth CAPTCHA verification');
  if (config.security_captcha_enabled !== false) {
    throw new Error('Supabase Auth still reports security_captcha_enabled=true.');
  }

  return { enabled: false };
};

export const removeVercelCaptchaEnv = async ({ projectId, teamId, token, fetchImpl = fetch }) => {
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is required.');
  if (!teamId) throw new Error('VERCEL_ORG_ID is required.');
  if (!token) throw new Error('VERCEL_TOKEN is required.');

  const listUrl = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`);
  listUrl.searchParams.set('teamId', teamId);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const payload = await readJson(await fetchImpl(listUrl, { headers }), 'Vercel environment lookup');
  const envs = Array.isArray(payload?.envs) ? payload.envs : [];
  const targets = envs.filter(({ key }) => CAPTCHA_ENV_KEYS.has(String(key ?? '')));

  for (const entry of targets) {
    const deleteUrl = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(entry.id)}`);
    deleteUrl.searchParams.set('teamId', teamId);
    const response = await fetchImpl(deleteUrl, { method: 'DELETE', headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to delete Vercel env ${entry.key}: HTTP ${response.status} ${text.slice(0, 200)}`);
    }
  }

  const after = await readJson(await fetchImpl(listUrl, { headers }), 'Vercel environment verification');
  const remaining = (Array.isArray(after?.envs) ? after.envs : [])
    .map(({ key }) => String(key ?? ''))
    .filter((key) => CAPTCHA_ENV_KEYS.has(key));
  if (remaining.length > 0) {
    throw new Error(`CAPTCHA environment variables remain in Vercel: ${remaining.join(', ')}`);
  }

  return { removed: targets.map(({ key }) => key).sort(), remaining: [] };
};

export const retireCaptchaProduction = async ({ env = process.env, fetchImpl = fetch } = {}) => {
  const supabase = await disableSupabaseCaptcha({
    projectRef: env.SUPABASE_PROJECT_REF || 'hdghpmssudrqhsbvrdyt',
    accessToken: env.SUPABASE_ACCESS_TOKEN,
    fetchImpl,
  });
  const vercel = await removeVercelCaptchaEnv({
    projectId: env.VERCEL_PROJECT_ID,
    teamId: env.VERCEL_ORG_ID,
    token: env.VERCEL_TOKEN,
    fetchImpl,
  });

  return {
    status: 'passed',
    supabase,
    vercel,
  };
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  retireCaptchaProduction()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
