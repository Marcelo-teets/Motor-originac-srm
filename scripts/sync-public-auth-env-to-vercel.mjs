import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const defaultConfig = JSON.parse(readFileSync(
  new URL('../frontend/public-auth.config.json', import.meta.url),
  'utf8',
));

export const PUBLIC_AUTH_ENV_KEYS = [
  'NEON_AUTH_BASE_URL',
  'NEON_AUTH_JWKS_URL',
  'MOTOR_AUTH_BOOTSTRAP_ENABLED',
  'APP_BASE_URL',
  'VITE_NEON_AUTH_URL',
];

const readJson = async (response, label) => {
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`${label} returned invalid JSON.`); }
  if (!response.ok) {
    const nestedMessage = typeof payload?.error?.message === 'string' ? payload.error.message : null;
    const nestedCode = typeof payload?.error?.code === 'string' ? payload.error.code : null;
    const topMessage = typeof payload?.message === 'string' ? payload.message : null;
    const detail = nestedMessage
      ? `${nestedCode ? `${nestedCode}: ` : ''}${nestedMessage}`
      : (topMessage || `HTTP ${response.status}`);
    throw new Error(`${label} failed: ${detail}`);
  }
  return payload;
};

const includesTarget = (target, expected) => (
  Array.isArray(target) ? target.includes(expected) : target === expected
);

export const validatePublicAuthConfig = ({
  authProvider = defaultConfig.authProvider,
  neonProjectId = defaultConfig.neonProjectId,
  neonAuthBaseUrl = defaultConfig.neonAuthBaseUrl,
  neonAuthJwksUrl = defaultConfig.neonAuthJwksUrl,
}) => {
  if (authProvider !== 'neon') throw new Error('Canonical Auth provider must be neon.');
  if (!neonProjectId) throw new Error('Neon project ID is required.');
  if (!neonAuthBaseUrl) throw new Error('Neon Auth base URL is required.');
  if (!neonAuthJwksUrl) throw new Error('Neon Auth JWKS URL is required.');

  const parsed = new URL(neonAuthBaseUrl);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.neon.tech')) {
    throw new Error('Neon Auth base URL must use HTTPS on neon.tech.');
  }
  if (!parsed.pathname.endsWith('/auth')) throw new Error('Neon Auth base URL must end with /auth.');
  const expectedJwksUrl = `${parsed.toString().replace(/\/$/, '')}/.well-known/jwks.json`;
  if (new URL(neonAuthJwksUrl).toString() !== expectedJwksUrl) {
    throw new Error('Neon Auth JWKS URL must be derived from the canonical Auth base URL.');
  }

  return {
    authProvider,
    neonProjectId,
    neonAuthBaseUrl: parsed.toString().replace(/\/$/, ''),
    neonAuthJwksUrl: expectedJwksUrl,
  };
};

export const syncPublicAuthEnvToVercel = async ({
  projectId,
  teamId,
  token,
  authProvider = defaultConfig.authProvider,
  neonProjectId = defaultConfig.neonProjectId,
  neonAuthBaseUrl = defaultConfig.neonAuthBaseUrl,
  neonAuthJwksUrl = defaultConfig.neonAuthJwksUrl,
  fetchImpl = fetch,
} = {}) => {
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is required.');
  if (!teamId) throw new Error('VERCEL_ORG_ID is required.');
  if (!token) throw new Error('VERCEL_TOKEN is required.');

  const publicConfig = validatePublicAuthConfig({ authProvider, neonProjectId, neonAuthBaseUrl, neonAuthJwksUrl });
  const values = new Map([
    ['NEON_AUTH_BASE_URL', publicConfig.neonAuthBaseUrl],
    ['NEON_AUTH_JWKS_URL', publicConfig.neonAuthJwksUrl],
    ['MOTOR_AUTH_BOOTSTRAP_ENABLED', 'false'],
    ['APP_BASE_URL', 'https://motor-originac-srm.vercel.app'],
    ['VITE_NEON_AUTH_URL', publicConfig.neonAuthBaseUrl],
  ]);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const listUrl = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
  listUrl.searchParams.set('teamId', teamId);
  const initialPayload = await readJson(await fetchImpl(listUrl, { headers }), 'Vercel environment discovery');
  const initialEnvs = Array.isArray(initialPayload?.envs) ? initialPayload.envs : [];
  const desiredTargets = ['production', 'preview', 'development'];

  for (const [key, value] of values) {
    const matches = initialEnvs.filter((entry) => entry?.key === key && entry?.id);
    const coveredTargets = new Set();

    for (const entry of matches) {
      const entryTargets = Array.isArray(entry.target) ? entry.target : [entry.target].filter(Boolean);
      entryTargets.forEach((target) => coveredTargets.add(target));

      const editUrl = new URL(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(entry.id)}`,
      );
      editUrl.searchParams.set('teamId', teamId);
      await readJson(await fetchImpl(editUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          value,
          type: 'encrypted',
          target: entryTargets,
          ...(entry.gitBranch ? { gitBranch: entry.gitBranch } : {}),
          comment: 'Canonical Neon Managed Auth configuration for the Origination Intelligence Platform.',
        }),
      }), `Vercel environment update for ${key}`);
    }

    const missingTargets = desiredTargets.filter((target) => !coveredTargets.has(target));
    if (missingTargets.length) {
      const createUrl = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
      createUrl.searchParams.set('teamId', teamId);
      await readJson(await fetchImpl(createUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          key,
          value,
          type: 'encrypted',
          target: missingTargets,
          comment: 'Canonical Neon Managed Auth configuration for the Origination Intelligence Platform.',
        }]),
      }), `Vercel environment create for ${key}`);
    }
  }

  const payload = await readJson(await fetchImpl(listUrl, { headers }), 'Vercel environment verification');
  const envs = Array.isArray(payload?.envs) ? payload.envs : [];
  const verified = PUBLIC_AUTH_ENV_KEYS.map((key) => {
    const match = envs.find((entry) => entry?.key === key && includesTarget(entry?.target, 'production'));
    if (!match) throw new Error(`${key} is not configured for Vercel production.`);
    return { key, target: match.target };
  });

  return {
    status: 'passed',
    authProvider: publicConfig.authProvider,
    neonProjectId: publicConfig.neonProjectId,
    synced: verified,
  };
};

export const runFromEnvironment = async (env = process.env, fetchImpl = fetch) => syncPublicAuthEnvToVercel({
  projectId: env.VERCEL_PROJECT_ID,
  teamId: env.VERCEL_ORG_ID,
  token: env.VERCEL_TOKEN,
  authProvider: env.AUTH_PROVIDER || defaultConfig.authProvider,
  neonProjectId: env.NEON_PROJECT_ID || defaultConfig.neonProjectId,
  neonAuthBaseUrl: env.NEON_AUTH_BASE_URL || defaultConfig.neonAuthBaseUrl,
  neonAuthJwksUrl: env.NEON_AUTH_JWKS_URL || defaultConfig.neonAuthJwksUrl,
  fetchImpl,
});

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  runFromEnvironment()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
