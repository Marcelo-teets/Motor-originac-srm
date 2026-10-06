// Neon data client for the Vercel functions in api/ and serverless/.
//
// Delegates to the backend NeonPostgresClient so both runtimes share one
// implementation (RPC argument binding, JSON parameter encoding, row-shape
// grouping). Vercel bundles api/ and serverless/ as CommonJS while backend/ is
// an ESM package, so the backend module is loaded with dynamic import() — a
// static import would compile to require() of an ES module. Node caches it
// after the first call of a warm instance.
import type { FilterDefinition, NeonPostgresClient, QueryOptions } from '../backend/src/lib/postgres.js';

export type { FilterDefinition, QueryOptions };

const loadPostgres = () => import('../backend/src/lib/postgres.js');

export const neonDatabaseUrl = () => (
  process.env.MOTOR_NEON_DATABASE_URL
  || process.env.DATABASE_URL
  || ''
).trim();

export const isNeonDatabaseConfigured = () => Boolean(neonDatabaseUrl());

const client = async (): Promise<NeonPostgresClient> => {
  const { getNeonPostgresClient } = await loadPostgres();
  const instance = getNeonPostgresClient(neonDatabaseUrl());
  if (!instance) {
    throw Object.assign(
      new Error('Neon database is not configured. Set MOTOR_NEON_DATABASE_URL or DATABASE_URL.'),
      { statusCode: 503 },
    );
  }
  return instance;
};

export const requireNeonDataClient = () => {
  if (!isNeonDatabaseConfigured()) {
    throw Object.assign(
      new Error('Neon database is not configured. Set MOTOR_NEON_DATABASE_URL or DATABASE_URL.'),
      { statusCode: 503 },
    );
  }
  return {
    select: async (table: string, options?: QueryOptions) => (await client()).select(table, options),
    insert: async (table: string, rows: unknown[]) => (await client()).insert(table, rows),
    upsert: async (table: string, rows: unknown[], onConflict?: string) => (await client()).upsert(table, rows, onConflict),
    update: async (table: string, payload: Record<string, unknown>, filters: FilterDefinition[]) => (
      (await client()).update(table, payload, filters)
    ),
    delete: async (table: string, filters: FilterDefinition[]) => (await client()).delete(table, filters),
    query: async <T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []) => (
      (await client()).query<T>(text, values)
    ),
    rpc: async <T = unknown>(fn: string, args: Record<string, unknown>) => (await client()).rpc<T>(fn, args),
    rpcAsUser: async <T = unknown>(fn: string, args: Record<string, unknown>, identity: { id: string; email?: string; role?: string }) => (
      (await client()).rpcAsUser<T>(fn, args, identity)
    ),
    health: async () => (await client()).health(),
  };
};
