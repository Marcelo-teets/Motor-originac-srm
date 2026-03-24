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

export const env = {
  port: Number(process.env.PORT ?? 4000),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  useSupabase: process.env.USE_SUPABASE ? process.env.USE_SUPABASE === 'true' : hasSupabaseCredentials,
  bootstrapSupabase: process.env.BOOTSTRAP_SUPABASE === 'true',
};
