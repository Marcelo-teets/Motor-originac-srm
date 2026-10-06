import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const roots = [
  'api',
  'backend/src',
  'frontend/src',
  'serverless',
  'scripts',
  '.github/workflows',
];
const standalone = ['package.json', 'package-lock.json', '.env.example', 'vercel.json'];
// Temporary legacy-data recovery (manual dispatch only). Delete together with
// migration/supabase-recovery/ once the import into Neon is validated.
const RECOVERY_ALLOWLIST = new Set([
  '.github/workflows/legacy-data-recovery.yml',
  'scripts/no-supabase-runtime-contract.test.mjs',
]);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.sh']);

const files = [];
const walk = (entry) => {
  if (!existsSync(entry)) return;
  const stat = statSync(entry);
  if (stat.isDirectory()) {
    for (const child of readdirSync(entry)) walk(path.join(entry, child));
    return;
  }
  if (textExtensions.has(path.extname(entry)) || standalone.includes(entry)) files.push(entry);
};
roots.forEach(walk);
standalone.forEach(walk);

const forbidden = [
  /SUPABASE_[A-Z0-9_]+/g,
  /https?:\/\/[^\s'"]*\.supabase\.co/gi,
  /@supabase\//g,
  /getSupabaseClient/g,
  /supabaseAuth/g,
  /(?:from|import\()\s*['"][^'"]*supabase[^'"]*['"]/gi,
  /env\.useSupabase/g,
  /bootstrapSupabase/g,
];

test('active runtime contains no Supabase dependency or credentials', () => {
  const violations = [];
  for (const file of files) {
    if (RECOVERY_ALLOWLIST.has(file.split(path.sep).join('/'))) continue;
    const content = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) violations.push(file + ' :: ' + pattern);
    }
  }
  assert.deepEqual([...new Set(violations)], []);
});

test('legacy Supabase runtime directory is absent', () => {
  assert.equal(existsSync('supabase'), false);
});

test('legacy recovery stays quarantined and manual-only', () => {
  const workflow = readFileSync('.github/workflows/legacy-data-recovery.yml', 'utf8');
  assert.match(workflow, /on:\n  workflow_dispatch:\n/);
  assert.doesNotMatch(workflow, /schedule:|push:|pull_request:/);
  assert.match(workflow, /node migration\/supabase-recovery\//);
  for (const root of ['api', 'backend/src', 'frontend/src', 'serverless', 'scripts']) {
    for (const file of files.filter((entry) => entry.startsWith(root) && !RECOVERY_ALLOWLIST.has(entry))) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), /migration\/supabase-recovery/, `${file} must not import the recovery tooling`);
    }
  }
});
