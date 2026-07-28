import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const defaultConfig = JSON.parse(readFileSync(
  new URL('../frontend/public-auth.config.json', import.meta.url),
  'utf8',
));

export const PUBLIC_AUTH_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
];

const readJson = async (response, label) => {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
  if (!response.ok) {
    const detail = typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${detail}`);
  }
  return payload;
};

const includesTarget = (target, expected) => (
  Array.isArray(target) ? target.includes(expected) : target === expected
);

export const validatePublicAuthConfig = ({ projectRef, supabaseUrl, publishableKey }) => {
  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF is required.');
  if (!supabaseUrl) throw new Error('Supabase public URL is required.');
  if (!publishableKey) throw new Error('Supabase publishable key is required.');

  const parsedUrl = new URL(supabaseUrl);
  const expectedHost = `${projectRef}.supabase.co`;
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== expectedHost) {
    throw new Error(`Supabase public URL must target ${expectedHost}.`);
  }

  if (publishableKey.startsWith('sb_secret_')) {
    throw new Error('A secret Supabase key cannot be exposed to the frontend.');
  }

  if (!publishableKey.startsWith('sb_publishable_') && publishableKey.split('.').length !== 3) {
    throw new Error('Supabase public key format is invalid.');
  }

  return {
    projectRef,
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ''),
    publishableKey,
  };
};

export const syncPublicAuthEnvToVercel = async ({
  projectId,
  teamId,
  token,
  projectRef = defaultConfig.supabaseProjectRef,
  supabaseUrl = defaultConfig.supabaseUrl,
  publishableKey = defaultConfig.supabasePublishableKey,
  fetchImpl = fetch,
} = {}) => {
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is required.');
  if (!teamId) throw new Error('VERCEL_ORG_ID is required.');
  if (!token) throw new Error('VERCEL_TOKEN is required.');

  const publicConfig = validatePublicAuthConfig({ projectRef, supabaseUrl, publishableKey });
  const values = new Map([
    ['VITE_SUPABASE_URL', publicConfig.supabaseUrl],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', publicConfig.publishableKey],
    ['VITE_SUPABASE_ANON_KEY', publicConfig.publishableKey],
  ]);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  for (const [key, value] of values) {
    const createUrl = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
    createUrl.searchParams.set('teamId', teamId);
    createUrl.searchParams.set('upsert', 'true');
    await readJson(await fetchImpl(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
        comment: 'Canonical public Supabase Auth configuration for the Origination Intelligence Platform.',
      }),
    }), `Vercel environment upsert for ${key}`);
  }

  const listUrl = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
  listUrl.searchParams.set('teamId', teamId);
  const payload = await readJson(await fetchImpl(listUrl, { headers }), 'Vercel environment verification');
  const envs = Array.isArray(payload?.envs) ? payload.envs : [];
  const verified = PUBLIC_AUTH_ENV_KEYS.map((key) => {
    const match = envs.find((entry) => entry?.key === key && includesTarget(entry?.target, 'production'));
    if (!match) throw new Error(`${key} is not configured for Vercel production.`);
    return { key, target: match.target };
  });

  return {
    status: 'passed',
    projectRef: publicConfig.projectRef,
    synced: verified,
  };
};

export const runFromEnvironment = async (env = process.env, fetchImpl = fetch) => syncPublicAuthEnvToVercel({
  projectId: env.VERCEL_PROJECT_ID,
  teamId: env.VERCEL_ORG_ID,
  token: env.VERCEL_TOKEN,
  projectRef: env.SUPABASE_PROJECT_REF || defaultConfig.supabaseProjectRef,
  supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || defaultConfig.supabaseUrl,
  publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || env.SUPABASE_ANON_KEY
    || defaultConfig.supabasePublishableKey,
  fetchImpl,
});

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runFromEnvironment()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
