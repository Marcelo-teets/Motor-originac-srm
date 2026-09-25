// Static inventory only: a migration classified "review" is NEVER approved for Neon by this script.
// No network, credentials, SQL execution, or DB mutations.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANAGED = Object.freeze({
  supabase_auth: /\b(?:auth|storage|realtime|vault|supabase_functions|extensions)\s*\./i,
  pg_cron: /\b(?:cron)\s*\.|\bpg_cron\b/i,
  http_or_pg_net: /\b(?:net|http)\s*\.|\bpg_net\b/i,
  privileges: /\b(?:service_role|authenticated|anon|supabase_admin|supabase_auth_admin)\b/i,
  extensions: /\b(?:create|alter)\s+extension\b/i,
  security_or_rls: /\b(?:security\s+definer|row\s+level\s+security|create\s+policy|alter\s+policy)\b/i,
});
export function classify(fileName, sql) {
  const hits=Object.entries(MANAGED).filter(([, re])=>re.test(sql)).map(([name])=>name);
  return {
    file: fileName,
    category: hits.length?'manual_compatibility_review':'not_verified',
    flags:hits,
    bytes:Buffer.byteLength(sql,'utf8'),
  };
}
export function inventory(root) {
  const dir=join(root,'db','migrations');
  const rows=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()
    .map(f=>classify(f,readFileSync(join(dir,f),'utf8')));
  const allFlags=Object.fromEntries(Object.keys(MANAGED).map(k=>[k,rows.filter(r=>r.flags.includes(k)).length]));
  const legacySchema=readFileSync(join(root,'db','schema.sql'),'utf8');
  const report={
    project:'steep-poetry-38942951',
    sourceProject:'hdghpmssudrqhsbvrdyt',
    source:'GitHub main SQL files, NOT a live Supabase export',
    status:'STATIC_INVENTORY_ONLY',
    generatedUtc:new Date().toISOString(),
    totalMigrations:rows.length,
    reviewRequired:rows.filter(r=>r.flags.length>0).length,
    notVerified:rows.filter(r=>!r.flags.length).length,
    flags:allFlags,
    legacySchema:{bytes:Buffer.byteLength(legacySchema,'utf8'),flags:classify('db/schema.sql',legacySchema).flags},
    migrations:rows,
    warning:'Never apply the entire Supabase migration history to Neon automatically. Versioned SQL is not proof of production data/schema parity.',
  };
  return report;
}
const thisFile=fileURLToPath(import.meta.url);
if(process.argv[1]&&resolve(process.argv[1])===thisFile) {
  const root=resolve(process.argv[2]??'.');
  const output=resolve(process.argv[3]??'neon-schema-audit.json');
  const report=inventory(root);
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:report.status,totalMigrations:report.totalMigrations,
    reviewRequired:report.reviewRequired,notVerified:report.notVerified,flags:report.flags,
    report:output})+'\n');
}
