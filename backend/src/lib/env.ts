import fs from 'node:fs';
import path from 'node:path';

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
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
};

loadEnvFile();

const hasSupabaseCredentials = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
const explicitUseSupabase = process.env.USE_SUPABASE ? process.env.USE_SUPABASE === 'true' : undefined;
const useSupabase = explicitUseSupabase ?? hasSupabaseCredentials;
const isManagedProduction = process.env.APP_ENV === 'production'
  || process.env.VERCEL_ENV === 'production'
  || process.env.VERCEL_ENV === 'preview';

if (isManagedProduction && !useSupabase) {
  throw new Error('Supabase is required in managed production and preview. Set USE_SUPABASE=true and Supabase credentials.');
}

const parseCsv = (value: string | undefined, fallback: string[]) =>
  value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
const defaultCorsOrigins = ['http://localhost:5173', 'http://localhost:4173', 'https://motor-originac-srm-marcelo-teets-projects.vercel.app', 'https://motor-originac-srm.vercel.app'];

export const env = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  useSupabase,
  isManagedProduction,
  bootstrapSupabase: process.env.BOOTSTRAP_SUPABASE === 'true',
  maisRetornoApiKey: process.env.MAIS_RETORNO_API_KEY ?? '',
  maisRetornoApiBaseUrl: process.env.MAIS_RETORNO_API_BASE_URL ?? '',
  maisRetornoApiPath: process.env.MAIS_RETORNO_API_PATH ?? '',
  maisRetornoMonthlyQuota: process.env.MAIS_RETORNO_MONTHLY_QUOTA ?? '500',
  maisRetornoMonthlyTarget: process.env.MAIS_RETORNO_MONTHLY_TARGET ?? '500',
  corsOrigins: parseCsv(process.env.CORS_ORIGINS, defaultCorsOrigins),
};
