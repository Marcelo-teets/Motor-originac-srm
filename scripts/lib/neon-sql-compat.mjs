// Deterministic rewrites that let historical migrations (written for the legacy
// Postgres provider) run unchanged on Neon. Every rule is covered by
// scripts/neon-sql-compat.test.mjs. Anything that cannot be rewritten safely
// (pg_cron jobs, vault secrets, pg_net/http calls, storage buckets) is rejected
// so the file has to be ported by hand into db/neon/.

const UNSUPPORTED = [
  [/\bcron\.(?:schedule|unschedule|alter_job|job)\b/i, 'pg_cron (Neon only allows it in database "postgres"; use Vercel Cron)'],
  [/\bvault\.[a-z_]+/i, 'vault secrets (use Vercel environment variables)'],
  [/\bnet\.http_[a-z_]+/i, 'pg_net HTTP calls (call the API from Vercel/GitHub Actions)'],
  [/\bextensions\.http(?:_[a-z_]+)?\b/i, 'pgsql-http extension'],
  [/\bstorage\.(?:buckets|objects)\b/i, 'storage buckets'],
  [/\bauth\.users\b/i, 'auth.users (identity lives in neon_auth + public.user_profiles)'],
];

const REWRITES = [
  // Neon installs pgcrypto/vector in schema public; the legacy provider used "extensions".
  [/\bcreate\s+extension\s+if\s+not\s+exists\s+(\w+)\s+with\s+schema\s+extensions\s*;/gi, 'create extension if not exists $1;'],
  [/\bextensions\.(digest|gen_random_bytes|gen_random_uuid|hmac|crypt|gen_salt|vector|halfvec|vector_cosine_ops|vector_l2_ops|vector_ip_ops|cosine_distance)\b/gi, 'public.$1'],
  // pg_session_jwt exposes the verified claims through auth.session(); there is no auth.role().
  [/\bauth\.role\(\)/gi, "(auth.session() ->> 'role')"],
  // Transactions are owned by the migrator.
  [/^\s*begin\s*;\s*$/gim, ''],
  [/^\s*commit\s*;\s*$/gim, ''],
];

// pg_cron blocks wrapped in "if exists (... extname = 'pg_cron')" are inert on Neon
// (the extension is not installed in neondb); their jobs run from
// .github/workflows/neon-scheduled-jobs.yml instead.
const GUARDED_CRON = /extname\s*=\s*'pg_cron'/i;

export const findUnsupportedSql = (sql) => {
  const code = stripSqlComments(sql);
  return UNSUPPORTED
    .filter(([pattern, reason]) => pattern.test(code) && !(reason.startsWith('pg_cron') && GUARDED_CRON.test(code)))
    .map(([, reason]) => reason);
};

export const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--[^\n]*/g, '');

// Legacy seeds inserted text ids ('src_*') into source_catalog. On Neon the id is
// uuid; the same deterministic md5-derived uuid used by
// db/neon/20261001_neon_runtime_bootstrap_seed.sql is produced by
// private.legacy_source_uuid(code) (db/neon/20261006_neon_legacy_runtime_objects.sql).
const SOURCE_CATALOG_INSERT = /insert\s+into\s+(?:public\.)?source_catalog\s*\(\s*id\s*,[\s\S]*?;[ \t]*$/gim;
const TEXT_SOURCE_ID_TUPLE = /\(\s*'(src_[a-z0-9_]+)'/g;

const rewriteLegacySourceIds = (sql) => sql.replace(SOURCE_CATALOG_INSERT, (statement) => (
  statement.replace(TEXT_SOURCE_ID_TUPLE, "(private.legacy_source_uuid('$1')")
));

export const toNeonSql = (sql) => rewriteLegacySourceIds(
  REWRITES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), sql),
);
