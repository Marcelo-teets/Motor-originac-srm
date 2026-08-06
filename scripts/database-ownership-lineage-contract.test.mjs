import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(join(repoRoot, relativePath), 'utf8');

const ownershipMigration = read('db/migrations/20260727123000_harden_user_owned_data_rls.sql');
const vectorMigration = read('db/migrations/20260727123100_harden_vector_corpus_and_role_rpc.sql');
const historyMigration = read('db/migrations/20260727123200_repair_company_signal_history.sql');
const qualityMigration = read('db/migrations/20260727123300_signal_quality_guardrails_and_score_identity.sql');
const copilotEngine = read('backend/src/ai/copilotQueryEngine.ts');

test('user-private tables have explicit owner identity and owner-scoped RLS', () => {
  assert.match(ownershipMigration, /add column if not exists owner_user_id uuid/i);
  assert.match(ownershipMigration, /ai_conversations_select_owner_or_god/i);
  assert.match(ownershipMigration, /notifications_select_owner_or_god/i);
  assert.match(ownershipMigration, /conversation\.owner_user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(ownershipMigration, /create policy\s+ai_conv_all_authed/i);
  assert.match(ownershipMigration, /revoke all privileges on table public\.ai_conversations from anon, authenticated/i);
});

test('Copilot persists the authenticated owner id', () => {
  assert.match(copilotEngine, /owner_user_id:\s*userId \?\? null/);
});

test('vector corpus is authenticated read-only and service-role writable', () => {
  assert.match(vectorMigration, /vector_documents_authenticated_read/i);
  assert.match(vectorMigration, /vector_documents_service_role_all/i);
  assert.match(vectorMigration, /grant select on table public\.vector_documents to authenticated/i);
  assert.doesNotMatch(vectorMigration, /grant .*insert.*vector_documents.*authenticated/i);
});

test('obsolete role RPC is removed', () => {
  assert.match(vectorMigration, /drop function if exists public\.set_user_role_by_email\(text, text\)/i);
});

test('historical signal repair does not replay downstream jobs', () => {
  assert.match(historyMigration, /disable trigger trg_enqueue_knowledge_learning_signal/i);
  assert.match(historyMigration, /disable trigger capture_signal_factor_observations/i);
  assert.match(historyMigration, /enable trigger capture_signal_factor_observations/i);
  assert.match(historyMigration, /enable trigger trg_enqueue_knowledge_learning_signal/i);
  assert.match(historyMigration, /company_signals_observed_vs_inferred_check/i);
});

test('future signal semantics and lineage are normalized', () => {
  assert.match(qualityMigration, /normalize_company_signal_lineage/i);
  assert.match(qualityMigration, /trg_normalize_company_signal_lineage/i);
  assert.match(qualityMigration, /company_signal_lineage_quality_v1/i);
  assert.match(qualityMigration, /with \(security_invoker = true\)/i);
});

test('score snapshots are idempotent on the actual history identity', () => {
  assert.match(qualityMigration, /create unique index if not exists uq_score_snapshots_identity/i);
  assert.match(qualityMigration, /company_id,\s*created_at,\s*score_type/is);
  assert.match(qualityMigration, /coalesce\(nullif\(score_version, ''\), version::text, 'unversioned'\)/i);
});
