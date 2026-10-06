import fs from 'node:fs';
import path from 'node:path';

// Accept the common `KEY="value"` / `KEY='value'` .env forms.
const unquote = (value: string) => (
  value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])
    ? value.slice(1, -1)
    : value
);

const loadEnvFile = () => {
  const rootDir = path.resolve(process.cwd(), '..');
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(rootDir, '.env')];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = unquote(trimmed.slice(separatorIndex + 1).trim());
      if (!(key in process.env)) process.env[key] = value;
    }
  }
};

loadEnvFile();

// `||` (not `??`) so an empty MOTOR_NEON_DATABASE_URL still falls back to DATABASE_URL.
const neonDatabaseUrl = (process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const hasNeonCredentials = Boolean(neonDatabaseUrl);
const dataProvider = hasNeonCredentials ? 'neon' : 'memory';
const neonAuthBaseUrl = (process.env.NEON_AUTH_BASE_URL ?? '').replace(/\/$/, '');
const neonAuthJwksUrl = process.env.NEON_AUTH_JWKS_URL
  || (neonAuthBaseUrl ? `${neonAuthBaseUrl}/.well-known/jwks.json` : '');

export const env = {
  port: Number(process.env.PORT ?? 4000),
  dataProvider,
  neonDatabaseUrl,
  usePersistentData: dataProvider !== 'memory',
  appBaseUrl: (process.env.APP_BASE_URL ?? 'https://motor-originac-srm.vercel.app').replace(/\/$/, ''),
  authProvider: neonAuthBaseUrl ? 'neon' : 'none',
  neonAuthBaseUrl,
  neonAuthJwksUrl,
  authBootstrapEnabled: process.env.MOTOR_AUTH_BOOTSTRAP_ENABLED === 'true',
  maisRetornoApiKey: process.env.MAIS_RETORNO_API_KEY ?? '',
  maisRetornoApiBaseUrl: process.env.MAIS_RETORNO_API_BASE_URL ?? '',
  maisRetornoApiPath: process.env.MAIS_RETORNO_API_PATH ?? '',
  maisRetornoMonthlyQuota: process.env.MAIS_RETORNO_MONTHLY_QUOTA ?? '500',
  maisRetornoMonthlyTarget: process.env.MAIS_RETORNO_MONTHLY_TARGET ?? '500',
};
