import { env } from './env.js';
import { getNeonPostgresClient } from './postgres.js';

export const getDataClient = () => {
  if (env.dataProvider !== 'neon' || !env.neonDatabaseUrl) return null;
  return getNeonPostgresClient(env.neonDatabaseUrl);
};

export const getDataProvider = () => env.dataProvider;

// Temporary source-compatibility alias while callers are renamed in this PR.
export const getSupabaseClient = getDataClient;
