import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptsDir, '..');
const migrationsDir = join(rootDir, 'db', 'migrations');
const fixPath = join(migrationsDir, '115_fix_knowledge_learning_service_role_detection.sql');
const fixSql = readFileSync(fixPath, 'utf8');

const protectedFunctions = [
  'knowledge_agent_sync_links',
  'knowledge_agent_upsert_node',
  'knowledge_claim_learning_jobs',
  'knowledge_fail_learning_run',
  'knowledge_finish_learning_run',
  'knowledge_learning_context',
  'knowledge_start_learning_run',
  'validate_knowledge_reference',
];

for (const functionName of protectedFunctions) {
  assert.match(fixSql, new RegExp(`'${functionName}'`), `${functionName} must be covered by migration 115`);
}

assert.match(
  fixSql,
  /current_user <> ''service_role''/,
  'service-role authorization must use the effective Postgres role selected by PostgREST',
);
assert.match(
  fixSql,
  /Legacy JWT role detection remains/,
  'migration must fail closed when any legacy guard remains',
);
assert.match(
  fixSql,
  /notify pgrst, 'reload schema'/,
  'PostgREST schema cache must be refreshed after replacing RPC definitions',
);

for (const fileName of readdirSync(migrationsDir)) {
  const match = /^(\d+)_.*\.sql$/.exec(fileName);
  if (!match || Number(match[1]) <= 115) continue;
  const sql = readFileSync(join(migrationsDir, fileName), 'utf8');
  assert.doesNotMatch(
    sql,
    /current_setting\(['"]request\.jwt\.claim\.role['"]\s*,\s*true\)/,
    `${basename(fileName)} must not reintroduce the deprecated request.jwt.claim.role setting`,
  );
}

console.log('Knowledge Learning Agent service-role contract is protected.');
