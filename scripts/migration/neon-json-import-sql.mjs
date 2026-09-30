import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { MIGRATION_TABLES, validateMigrationTable } from './neon-migration-manifest.mjs';

const argValue = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const quoteIdent = (value) => '"' + String(value).replaceAll('"','""') + '"';

export async function sha256File(filePath) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

export const sqlForBatch = ({table,rows,batchIndex}) => {
  validateMigrationTable(table);
  if (!rows.length) return '';
  const columns = [...new Set(rows.flatMap((row)=>Object.keys(row)))].sort();
  if (!columns.length) return '';
  const colSql = columns.map(quoteIdent).join(',');
  const json = JSON.stringify(rows);
  const tag = `$motor_${table}_${batchIndex}$`;
  return [
    `insert into public.${quoteIdent(table)} (${colSql})`,
    `select ${colSql}`,
    `from jsonb_populate_recordset(null::public.${quoteIdent(table)}, ${tag}${json}${tag}::jsonb)`,
    'on conflict do nothing;',
    '',
  ].join('\n');
};

export async function readNdjsonBatches(filePath,batchSize,onBatch) {
  const input = createReadStream(filePath,{encoding:'utf8'});
  const rl = createInterface({input,crlfDelay:Infinity});
  let batch=[];
  let index=0;
  let count=0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row=JSON.parse(line);
    batch.push(row);
    count += 1;
    if (batch.length >= batchSize) {
      await onBatch(batch,index++);
      batch=[];
    }
  }
  if (batch.length) await onBatch(batch,index++);
  return count;
}

export async function generateImportSql({bundleDir,outFile,batchSize=250,tables=MIGRATION_TABLES}) {
  const manifest=JSON.parse(await readFile(resolve(bundleDir,'manifest.json'),'utf8'));
  if (manifest.format!=='motor-supabase-rest-export-v1') throw new Error('Unsupported export manifest');
  if (manifest.probe) throw new Error('Probe manifest cannot be imported');

  if (!Array.isArray(manifest.tables) || new Set(manifest.tables.map((entry)=>entry.table)).size !== manifest.tables.length) {
    throw new Error('Missing or duplicate export manifest table entries');
  }
  const byTable=new Map(manifest.tables.map((entry)=>[entry.table,entry]));
  await mkdir(dirname(outFile),{recursive:true});

  let sql=[
    '-- Motor Supabase -> Neon data import',
    '-- Generated from a private REST export. Do not commit the generated SQL or source NDJSON.',
    '-- Target schema must already exist and match the UUID runtime contract.',
    'begin;',
    "set local statement_timeout = '0';",
    '',
  ].join('\n');

  for (const table of tables) {
    const entry=byTable.get(table);
    if (!entry) throw new Error(`Missing required export manifest entry for ${table}`);
    validateMigrationTable(table);
    if (entry.file !== `${table}.ndjson`) throw new Error(`Invalid export filename for ${table}`);
    if (!/^[a-f0-9]{64}$/i.test(entry.sha256 ?? '')) throw new Error(`Missing/invalid SHA-256 for ${table}`);
    const filePath=resolve(bundleDir,entry.file);
    const actualHash=await sha256File(filePath);
    if (actualHash.toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new Error(`SHA-256 mismatch for ${table}; refusing to generate import SQL`);
    }
    let emitted=0;
    const readCount=await readNdjsonBatches(filePath,batchSize,async(rows,batchIndex)=>{
      sql += sqlForBatch({table,rows,batchIndex});
      emitted += rows.length;
    });
    if (readCount!==entry.rowCount || emitted!==entry.rowCount) {
      throw new Error(`Import generation row-count mismatch for ${table}: read=${readCount} manifest=${entry.rowCount}`);
    }
  }

  sql += 'commit;\n';
  await writeFile(outFile,sql);
  return outFile;
}

async function main() {
  const bundleDir=resolve(argValue('bundle') ?? 'tmp/supabase-rest-export');
  const outFile=resolve(argValue('out') ?? 'tmp/neon-import.sql');
  const batchSize=Math.max(1,Math.min(Number(argValue('batch-size') ?? 250),1000));
  const requested=argValue('tables');
  const tables=requested
    ? requested.split(',').map((v)=>validateMigrationTable(v.trim())).filter(Boolean)
    : MIGRATION_TABLES;
  await generateImportSql({bundleDir,outFile,batchSize,tables});
  process.stdout.write(`Generated import SQL: ${outFile}\n`);
}

if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
  await main();
}
