import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REQUIRED_FUNCTIONS, REQUIRED_RELATIONS } from './lib/neon-runtime-contract.mjs';

const root = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) {
      if (entry !== 'node_modules') walk(file);
    } else if (/\.(ts|mjs)$/.test(file) && !/\.test\./.test(file) && !file.includes(`${path.sep}lib${path.sep}neon-migration-patches`)) {
      files.push(file);
    }
  }
};
['api', 'serverless', 'backend/src', 'scripts'].forEach((dir) => walk(path.join(root, dir)));

const referenced = () => {
  const tables = new Map();
  const functions = new Map();
  const add = (map, name, file) => map.set(name, map.get(name) ?? path.relative(root, file));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\.(?:select|insert|upsert|update|delete)\(\s*'([a-z_0-9]+)'/g)) add(tables, match[1], file);
    for (const match of source.matchAll(/\b(?:from|join|into|update)\s+public\.([a-z_0-9]+)\b(?!\s*\()/g)) add(tables, match[1], file);
    for (const match of source.matchAll(/\b(?:rpc|rpcAsUser|serviceRpc)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*'([a-z_0-9]+)'/g)) add(functions, match[1], file);
  }
  const knowledge = readFileSync(path.join(root, 'serverless/knowledge-rpc.ts'), 'utf8').split('const writeJson')[0];
  for (const match of knowledge.matchAll(/'(knowledge_[a-z_]+)'/g)) add(functions, match[1], 'serverless/knowledge-rpc.ts');
  return { tables, functions };
};

test('every table and RPC used by the runtime is part of the Neon runtime contract', () => {
  const { tables, functions } = referenced();
  const relations = new Set(REQUIRED_RELATIONS);
  const requiredFunctions = new Set(REQUIRED_FUNCTIONS.map(([schema, name]) => `${schema}.${name}`));
  const missingTables = [...tables].filter(([name]) => !relations.has(`public.${name}`)).map(([name, file]) => `${name} (${file})`);
  const missingFunctions = [...functions].filter(([name]) => !requiredFunctions.has(`public.${name}`)).map(([name, file]) => `${name} (${file})`);
  assert.deepEqual(missingTables, []);
  assert.deepEqual(missingFunctions, []);
});

test('the runtime contract has no stale legacy entries', () => {
  const names = REQUIRED_FUNCTIONS.map(([, name]) => name);
  for (const legacy of ['agentetome_admin_manifest_secure', 'queue_agentetome_admin_export', 'get_agentetome_runtime_secret', 'role']) {
    assert.ok(!names.includes(legacy), legacy);
  }
  assert.ok(!REQUIRED_RELATIONS.includes('public.ranking_snapshots'));
});
