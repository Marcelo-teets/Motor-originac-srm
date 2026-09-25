// Read-only portability inventory. Never executes any migration or reads row data.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHECKS = Object.freeze({
  auth: /\b(?:auth\.|auth\.users|auth\.uid\s*\()/i,
  storage: /\b(?:storage\.|storage\.objects)/i,
  cron: /\b(?:cron\.|pg_cron|pg_net|net\.http_)/i,
  vault: /\b(?:vault\.|pgsodium)/i,
  realtime: /\b(?:realtime\.|supabase_realtime)/i,
  privileged_roles: /\b(?:service_role|supabase_admin|supabase_auth_admin|authenticator)\b/i,
  extensions: /\b(?:create\s+extension|extensions\.)/i,
  rls: /\b(?:row\s+level\s+security|create\s+policy|alter\s+policy)/i,
  function_or_trigger: /\b(?:create\s+(?:or\s+replace\s+)?function|create\s+trigger)/i,
  destructive: /\b(?:drop\s+table|truncate\s+table|delete\s+from)/i,
});
export function classify(name, sql) {
  const tags = Object.fromEntries(Object.entries(CHECKS).filter(([, regex]) => regex.test(sql)).map(([key]) => [key, true]));
  return { name, tags: Object.keys(tags) };
}
export function inventory(root) {
  const directory = resolve(root, 'db', 'migrations');
  if (!existsSync(directory)) throw new Error('Missing db/migrations');
  const files = readdirSync(directory).filter(f => f.endsWith('.sql')).sort();
  if (files.length < 1) throw new Error('No SQL migrations found');
  const rows = files.map(name => classify(name, readFileSync(join(directory, name), 'utf8')));
  const summary = Object.fromEntries(Object.keys(CHECKS).map(tag => [tag, rows.filter(row => row.tags.includes(tag)).length]));
  const duplicates = files.map(f => f.replace(/^\d+[_-]/, '')).filter((f, i, all) => all.indexOf(f) !== i);
  return {
    project: 'steep-poetry-38942951',
    sourceProject: 'hdghpmssudrqhsbvrdyt',
    sourceGit: 'Marcelo-teets/Motor-originac-srm',
    totalMigrations: files.length,
    summary,
    duplicateBasenames: [...new Set(duplicates)],
    manualReview: rows.filter(row => row.tags.some(t => ['auth','storage','cron','vault','realtime','privileged_roles','extensions','destructive'].includes(t))),
    safeToApplyAutomatically: false,
    warning: 'Text-only heuristic. Audit all migrations and test schema compatibility in a disposable Neon branch. No data is reconstructed by code inventory.',
  };
}
async function main() {
  const result = inventory(process.cwd());
  const dest = process.env.NEON_PORTABILITY_OUTPUT;
  const output = JSON.stringify(result, null, 2) + '\n';
  if (dest) writeFileSync(dest, output, {mode: 0o600});
  process.stdout.write(JSON.stringify({totalMigrations:result.totalMigrations,summary:result.summary,manualReviewCount:result.manualReview.length,safeToApplyAutomatically:false})+'\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const {appendFileSync}=await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# Motor Neon compatibility inventory\n\n' +
      'Migrations scanned: '+result.totalMigrations+'; manual-review entries: '+result.manualReview.length+'\n\n' +
      Object.entries(result.summary).map(([k,v])=>'- '+k+': '+v).join('\n')+
      '\n\nNever import these SQL files directly into Neon without reviewing Supabase-managed dependencies.\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
