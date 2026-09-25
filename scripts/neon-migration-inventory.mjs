import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// Offline, read-only inventory. Never infer that a GitHub migration is applied in Supabase.
const root = process.cwd();
const excluded = new Set(['.git', 'node_modules', 'dist', 'build', '.vercel', 'coverage']);
const tokenRegex = /\b(?:SUPABASE|NEON|GOOGLE_DRIVE|MICROSOFT|CRON|DATABASE|VITE_SUPABASE)_[A-Z0-9_]+\b/g;
const markers = {
  auth: /(?:auth\.|supabase\.auth|supabase_auth|user_profiles)/i,
  storage: /(?:storage\.|storage_bucket|storage_object|supabase.storage)/i,
  cron: /(?:cron\.|pg_cron|cron\.schedule)/i,
  rpc: /(?:create\s+(?:or\s+replace\s+)?function|\brpc\()/i,
  rls: /(?:row\s+level\s+security|create\s+policy|auth\.uid\()/i,
  vault: /(?:vault\.|pgsodium|supabase_vault)/i,
  extension: /create\s+extension/i,
};
function walk(folder, result=[]) {
  if (!existsSync(folder)) return result;
  for (const item of readdirSync(folder, {withFileTypes:true})) {
    if (excluded.has(item.name)) continue;
    const name=join(folder,item.name);
    if (item.isDirectory()) walk(name,result);
    else if (item.isFile() && /\.(?:sql|ts|tsx|js|mjs|json|yml|yaml)$/.test(item.name) && statSync(name).size<2_000_000) result.push(name);
  }
  return result;
}
export function buildInventory(files) {
  const migrations=[], consumers=new Map(), flags=Object.fromEntries(Object.keys(markers).map(x=>[x,[]]));
  for (const entry of files) {
    const path=entry.path;
    const content=entry.content;
    const found=[...new Set(content.match(tokenRegex)??[])].sort();
    for (const key of found) {
      if (!consumers.has(key)) consumers.set(key, []);
      const paths=consumers.get(key);
      if(paths.length<30) paths.push(path);
    }
    if(path.startsWith('db/migrations/')&&path.endsWith('.sql')) {
      const types=Object.entries(markers).filter(([,regexp])=>regexp.test(content)).map(([key])=>key);
      migrations.push({path,compatibilityReview:types});
      for(const type of types) flags[type].push(path);
    }
  }
  return {generatedAt:new Date().toISOString(),kind:'static-code-inventory-not-live-db',
    migrationCount:migrations.length,migrations:migrations.sort((a,b)=>a.path.localeCompare(b.path)),
    compatibilityFlags:Object.fromEntries(Object.entries(flags).map(([k,v])=>[k,v.length])),
    environmentNames:[...consumers.keys()].sort().map(name=>({name,consumers:consumers.get(name)})),
    cautions:['SQL source files do not prove deployed Supabase schema','Neon portability requires auth/storage/cron/RLS review',
      'No secrets or company records were read','Do not run every migration blindly against Neon']};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const folders=['db/migrations','backend/src','frontend/src','api','serverless','.github/workflows'];
  const files=folders.flatMap(folder=>walk(join(root,folder))).map(file=>({path:relative(root,file).replaceAll('\\','/'),content:readFileSync(file,'utf8')}));
  process.stdout.write(JSON.stringify(buildInventory(files),null,2)+'\n');
}
