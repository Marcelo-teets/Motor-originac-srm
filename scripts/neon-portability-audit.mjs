// Static, credential-free inventory. It is NOT a migration executor or parity proof.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SQL_MARKERS = Object.freeze({
  supabase_auth: /\bauth\.(?:users|uid|jwt|role|identities|sessions|refresh_tokens)\b/i,
  supabase_storage: /\bstorage\.(?:objects|buckets|folders|filename|extension)\b/i,
  supabase_vault: /\bvault\./i,
  supabase_roles: /\b(?:anon|authenticated|service_role|supabase_admin)\b/i,
  pg_cron: /\b(?:cron\.|pg_cron)\b/i,
  pg_net: /\b(?:net\.|pg_net)\b/i,
  edge_or_realtime: /\b(?:realtime\.|supabase_functions\.|pg_graphql|pgjwt)\b/i,
  policy_and_rls: /\b(?:create\s+policy|enable\s+row\s+level\s+security|force\s+row\s+level\s+security)\b/i,
  destructive_or_backfill: /\b(?:drop\s+(?:table|schema|function|view|index)|truncate\s+|delete\s+from\s+|insert\s+into\s+|update\s+(?:public\.)?\w+\s+set)\b/i,
});
export const RUNTIME_MARKERS = Object.freeze({
  supabase_client: /@supabase\/supabase-js|createClient\(/i,
  supabase_data_api: /\/rest\/v1\/|\/rpc\/|SUPABASE_SERVICE_ROLE_KEY/i,
  supabase_auth: /supabase\.auth\.|\/auth\/v1\/|VITE_SUPABASE_/i,
  supabase_storage: /supabase\.storage\.|\/storage\/v1\//i,
  direct_db_client: /\b(?:postgres|pg|kysely|drizzle|prisma)\b/i,
});
const RUNTIME_DIRS=['api','backend/src','frontend/src','serverless','scripts','connectors'];
const EXCLUDED_DIRS=new Set(['node_modules','.git','dist','build','coverage','.next']);
const pathOf=(root,file)=>relative(root,file).replaceAll('\\','/');
const listFiles=(dir, extensions, max=2000)=>{
  if(!existsSync(dir))return [];
  const out=[],stack=[dir];
  while(stack.length){
    const here=stack.pop();
    for(const entry of readdirSync(here,{withFileTypes:true})){
      if(EXCLUDED_DIRS.has(entry.name))continue;
      const child=join(here,entry.name);
      if(entry.isDirectory())stack.push(child);
      else if(entry.isFile()&&extensions.some(ext=>entry.name.endsWith(ext)))out.push(child);
      if(out.length>max)throw new Error('Audit file count exceeds expected bound; inspect repo');
    }
  }
  return out.sort();
};
function markerInventory(root,files,markers){
  return Object.fromEntries(Object.entries(markers).map(([marker,re])=>{
    const hits=files.filter(file=>re.test(readFileSync(file,'utf8'))).map(file=>pathOf(root,file));
    return [marker,{count:hits.length,files:hits}];
  }));
}
export function audit(root=process.cwd()){
  root=resolve(root);
  const migrations=listFiles(join(root,'db','migrations'),['.sql']);
  const runtime=RUNTIME_DIRS.flatMap(x=>listFiles(join(root,x),['.ts','.tsx','.js','.mjs','.cjs'])).sort();
  const sql=markerInventory(root,migrations,SQL_MARKERS);
  const runtimeMarkers=markerInventory(root,runtime,RUNTIME_MARKERS);
  const schemaPath=join(root,'db','schema.sql');
  const migrationFirst=migrations.find(f=>f.endsWith('/001_canonical_init.sql'));
  const schema=existsSync(schemaPath)?readFileSync(schemaPath,'utf8'):'';
  const initial=migrationFirst?readFileSync(migrationFirst,'utf8'):'';
  const companyIdText=/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?companies\s*\([\s\S]{0,200}?id\s+text\s+primary\s+key/i.test(schema);
  const companyIdUuid=/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?companies\s*\([\s\S]{0,200}?id\s+uuid\s+primary\s+key/i.test(initial);
  const identifiers=migrations.map(f=>f.split('/').at(-1).match(/^\d+/)?.[0]).filter(Boolean);
  const duplicates=Object.entries(identifiers.reduce((acc,n)=>(acc[n]=(acc[n]||0)+1,acc),{}))
    .filter(([,count])=>count>1).map(([prefix,count])=>({prefix,count}));
  const status='REQUIRES_SOURCE_DUMP_AND_PORTABILITY_REVIEW';
  return {
    auditKind:'static_only', status, project:'steep-poetry-38942951',
    sourceProject:'hdghpmssudrqhsbvrdyt', sourceFiles:{migrations:migrations.length,runtime:runtime.length},
    schemaDivergence:{legacySchemaCompaniesTextId:companyIdText,firstMigrationCompaniesUuidId:companyIdUuid,
      caution:'db/schema.sql and initial migration may not reflect actual source; source dump wins'},
    duplicateMigrationPrefixes:duplicates,
    sqlDependencies:sql, runtimeDependencies:runtimeMarkers,
    requiredGates:[
      'consistent_source_dump', 'verified_empty_neon_preview', 'business_schema_dependency_review',
      'role_and_rls_portability', 'auth_users_and_jwt', 'storage_objects_and_buckets',
      'cron_worker_replacement', 'rowcount_and_checksum_parity','staging_authenticated_smoke',
      'controlled_cutover_and_rollback'
    ],
  };
}
export function summaryMarkdown(r){
  const lines=[
    '# Neon portability — static inventory (not a live migration proof)','',
    '- Source project: '+r.sourceProject,
    '- Destination project: '+r.project,
    '- SQL migration files scanned: '+r.sourceFiles.migrations,
    '- Runtime files scanned: '+r.sourceFiles.runtime,
    '- Actual source dump recovered: **not verified**',
    '- Neon restore / live auth: **not verified**',
    '- Static status: **'+r.status+'**',
    '',
    '## Supabase-specific SQL dependencies','','| Category | Matching files |','|---|---:|',
    ...Object.entries(r.sqlDependencies).map(([k,v])=>'| '+k+' | '+v.count+' |'),
    '','## Runtime dependencies','','| Category | Matching files |','|---|---:|',
    ...Object.entries(r.runtimeDependencies).map(([k,v])=>'| '+k+' | '+v.count+' |'),
    '','## Readiness gates','',
    ...r.requiredGates.map(x=>'- [ ] '+x),
    '','This report uses lexical heuristics. Review matches and migrate real data; do not autoapply all Supabase migrations to Neon.',
  ];
  return lines.join('\n')+'\n';
}
async function main(){
  const args=process.argv.slice(2);
  const root=process.cwd();
  const report=audit(root);
  const jsonFile=args.indexOf('--json')>=0?args[args.indexOf('--json')+1]:null;
  const mdFile=args.indexOf('--markdown')>=0?args[args.indexOf('--markdown')+1]:null;
  if(jsonFile)writeFileSync(jsonFile,JSON.stringify(report,null,2)+'\n');
  if(mdFile)writeFileSync(mdFile,summaryMarkdown(report));
  if(!jsonFile&&!mdFile)process.stdout.write(summaryMarkdown(report));
  // Exit 0 = scanner ran, NOT migration is safe.
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) await main();
