import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = readFileSync(new URL('../db/neon/20260928_neon_base_business_schema.sql', import.meta.url), 'utf8');
const vectorFn = readFileSync(new URL('../db/neon/20260928_neon_match_vector_documents.sql', import.meta.url), 'utf8');

test('Neon base schema is portable and keeps Supabase-managed surfaces out', () => {
  assert.match(base, /create table if not exists companies/i);
  assert.match(base, /create table if not exists company_signals/i);
  assert.match(base, /create table if not exists qualification_snapshots/i);
  assert.match(base, /create table if not exists company_patterns/i);
  assert.match(base, /create table if not exists lead_score_snapshots/i);
  assert.match(base, /create table if not exists pipeline/i);
  assert.match(base, /create extension if not exists vector/i);
  assert.doesNotMatch(base, /\bauth\.users\b/i);
  assert.doesNotMatch(base, /\bstorage\./i);
  assert.doesNotMatch(base, /\bcron\./i);
  assert.doesNotMatch(base, /create or replace function match_vector_documents/i);
});

test('Neon vector function is isolated and explicitly names public schema', () => {
  assert.match(vectorFn, /create or replace function public\.match_vector_documents/i);
  assert.match(vectorFn, /from public\.vector_documents/i);
  assert.match(vectorFn, /\$function\$/);
});
