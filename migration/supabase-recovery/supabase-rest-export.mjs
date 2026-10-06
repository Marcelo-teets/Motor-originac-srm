import { createHash } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MIGRATION_TABLES, validateMigrationTable } from './neon-migration-manifest.mjs';

const argValue = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const parseBooleanFlag = (name) => process.argv.includes(`--${name}`);

export const primaryKeyColumns = (table) => {
  validateMigrationTable(table);
  if (table === 'external_api_usage_monthly') return ['provider','month_key'];
  if (table === 'origination_reprocessing_queue') return ['company_id'];
  if (table === 'microsoft_connections') return ['user_id'];
  if (table === 'source_health') return ['source_code'];
  if (table === 'knowledge_learning_runtime_state') return ['singleton'];
  return ['id'];
};

export const paginationOrder = (table) =>
  primaryKeyColumns(table).map((column)=>`${column}.asc`).join(',');

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const countFromContentRange = (value) => {
  if (!value) return null;
  const slash = value.lastIndexOf('/');
  if (slash < 0) return null;
  const raw = value.slice(slash + 1);
  return /^\d+$/.test(raw) ? Number(raw) : null;
};

export async function fetchPage({baseUrl,key,table,offset,pageSize,fetchImpl=fetch}) {
  validateMigrationTable(table);
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/rest/v1/${table}`);
  url.searchParams.set('select','*');
  url.searchParams.set('order',paginationOrder(table));
  const response = await fetchImpl(url,{
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      Accept:'application/json',
      Prefer:'count=exact',
      Range:`${offset}-${offset + pageSize - 1}`,
      'Range-Unit':'items',
    },
    signal:AbortSignal.timeout(60_000),
  });
  if (!response.ok && response.status !== 206) {
    const body = (await response.text()).replace(/\s+/g,' ').slice(0,800);
    throw new Error(`REST export failed for ${table}: HTTP ${response.status}${body ? ` ${body}` : ''}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Unexpected REST payload for ${table}`);
  const total=countFromContentRange(response.headers.get('content-range'));
  if (total === null) throw new Error(`Missing exact row count for ${table}; refusing unverified export`);
  return {rows,total};
}

export async function probeTable(args) {
  const page = await fetchPage({...args,offset:0,pageSize:1});
  return {table:args.table,rowCount:page.total};
}

export async function exportTable({baseUrl,key,table,outDir,pageSize=1000,fetchImpl=fetch}) {
  validateMigrationTable(table);
  const filePath = resolve(outDir,`${table}.ndjson`);
  const handle = await open(filePath,'w');
  const hash = createHash('sha256');
  const keys=primaryKeyColumns(table);
  const seenPrimaryKeys=new Set();
  let offset = 0;
  let rowCount = 0;
  let expectedTotal = null;

  try {
    for (;;) {
      const {rows,total} = await fetchPage({baseUrl,key,table,offset,pageSize,fetchImpl});
      if (expectedTotal === null) expectedTotal = total;
      else if (total !== expectedTotal) {
        throw new Error(`Source count changed during export for ${table}: expected=${expectedTotal} observed=${total}`);
      }
      if (!rows.length) break;

      for (const row of rows) {
        const values=keys.map((keyColumn)=>row[keyColumn]);
        if (values.some((value)=>value === undefined || value === null)) {
          throw new Error(`Missing primary key while exporting ${table}`);
        }
        const pk=JSON.stringify(values);
        if (seenPrimaryKeys.has(pk)) {
          throw new Error(`Duplicate primary key while exporting ${table}; source may have changed during pagination`);
        }
        seenPrimaryKeys.add(pk);

        const line = JSON.stringify(row) + '\n';
        hash.update(line);
        await handle.write(line);
        rowCount += 1;
      }

      offset += rows.length;
      if (rows.length < pageSize || offset >= expectedTotal) break;
    }
  } finally {
    await handle.close();
  }

  if (rowCount !== expectedTotal) {
    throw new Error(`Row-count mismatch for ${table}: exported=${rowCount} expected=${expectedTotal}`);
  }

  const finalProbe=await probeTable({baseUrl,key,table,fetchImpl});
  if (finalProbe.rowCount !== rowCount) {
    throw new Error(`Source count changed during export for ${table}: exported=${rowCount} final=${finalProbe.rowCount}`);
  }

  return {table,rowCount,sha256:hash.digest('hex'),file:`${table}.ndjson`,primaryKey:keys};
}

export async function runExport({
  baseUrl,
  key,
  tables=MIGRATION_TABLES,
  outDir,
  pageSize=1000,
  probe=false,
  fetchImpl=fetch,
}) {
  await mkdir(outDir,{recursive:true});
  const startedAt = new Date().toISOString();
  const results = [];

  for (const table of tables) {
    const result = probe
      ? await probeTable({baseUrl,key,table,fetchImpl})
      : await exportTable({baseUrl,key,table,outDir,pageSize,fetchImpl});
    results.push(result);
    process.stdout.write(`${probe ? 'PROBE' : 'EXPORT'} ${table}: ${result.rowCount} rows\n`);
  }

  const manifest = {
    format:'motor-supabase-rest-export-v1',
    source:'supabase-postgrest',
    consistency:'ordered_exact_count_with_final_count_check_not_transactional_snapshot',
    startedAt,
    completedAt:new Date().toISOString(),
    probe,
    pageSize,
    tables:results,
  };
  await writeFile(resolve(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

async function main() {
  const baseUrl = requiredEnv('SUPABASE_URL');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const outDir = resolve(argValue('out') ?? 'tmp/supabase-rest-export');
  const pageSize = Math.max(1,Math.min(Number(argValue('page-size') ?? 1000),5000));
  const requested = argValue('tables');
  const tables = requested
    ? requested.split(',').map((v)=>validateMigrationTable(v.trim())).filter(Boolean)
    : MIGRATION_TABLES;
  const probe = parseBooleanFlag('probe');

  const manifest = await runExport({baseUrl,key,tables,outDir,pageSize,probe});
  process.stdout.write(`Manifest: ${resolve(outDir,'manifest.json')}\n`);
  process.stdout.write(`Tables: ${manifest.tables.length}; rows: ${manifest.tables.reduce((n,t)=>n+t.rowCount,0)}\n`);
}

if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
  await main();
}
