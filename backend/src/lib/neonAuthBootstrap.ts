import crypto from 'node:crypto';
import { Pool } from 'pg';
import { env } from './env.js';

let pool: Pool | null = null;
let poolUrl = '';

const getPool = () => {
  if (!env.neonDatabaseUrl) throw new Error('Neon database URL is required for Auth bootstrap.');
  if (!pool || poolUrl !== env.neonDatabaseUrl) {
    pool = new Pool({
      connectionString: env.neonDatabaseUrl,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'motor-originacao-auth-bootstrap',
    });
    poolUrl = env.neonDatabaseUrl;
  }
  return pool;
};

const emailHash = (email: string) => crypto
  .createHash('sha256')
  .update(email.trim().toLowerCase())
  .digest('hex');

export const isInitialAuthBootstrapAvailable = async () => {
  const result = await getPool().query(`
    select
      not exists (select 1 from private.auth_bootstrap_claim) as claim_open,
      not exists (select 1 from neon_auth."user") as no_auth_users,
      not exists (select 1 from public.user_profiles) as no_profiles
  `);
  const row = result.rows[0] ?? {};
  return Boolean(row.claim_open && row.no_auth_users && row.no_profiles);
};

export const claimInitialAuthBootstrap = async (email: string) => {
  const result = await getPool().query(
    `insert into private.auth_bootstrap_claim (singleton, claimed_at, claimed_email_hash)
     values (true, now(), $1)
     on conflict (singleton) do nothing
     returning singleton`,
    [emailHash(email)],
  );
  return result.rowCount === 1;
};

export const releaseInitialAuthBootstrapClaim = async () => {
  await getPool().query('delete from private.auth_bootstrap_claim where singleton = true');
};
