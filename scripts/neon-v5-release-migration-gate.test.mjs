import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { APPROVED_V5_PENDING_MIGRATIONS, verifyApprovedNeonPendingMigrations } from './lib/neon-v5-release-migration-gate.mjs';

test('allows only the reviewed V5 migrations', () => {
  const planned = ['db/neon/applied.sql', ...APPROVED_V5_PENDING_MIGRATIONS];
  assert.deepEqual(
    verifyApprovedNeonPendingMigrations({ planned, applied: ['db/neon/applied.sql'] }),
    APPROVED_V5_PENDING_MIGRATIONS,
  );
});

test('remains idempotent after an approved release', () => {
  assert.deepEqual(verifyApprovedNeonPendingMigrations({
    planned: [...APPROVED_V5_PENDING_MIGRATIONS],
    applied: [...APPROVED_V5_PENDING_MIGRATIONS],
  }), []);
});

test('fails closed when a new migration has not been reviewed', () => {
  assert.throws(() => verifyApprovedNeonPendingMigrations({
    planned: [...APPROVED_V5_PENDING_MIGRATIONS, 'db/neon/new_unreviewed_migration.sql'],
    applied: [],
  }), /unapproved Neon migrations pending/);
});

test('rejects invalid ledger data', () => {
  assert.throws(() => verifyApprovedNeonPendingMigrations({
    planned: undefined,
    applied: [],
  }), /must be arrays/);
});

test('bronze index cleanup keeps canonical index and checks strict definition equality', () => {
  const sql = readFileSync(new URL('../db/neon/20261011_neon_bronze_duplicate_ref_index_cleanup.sql', import.meta.url), 'utf8');
  assert.match(sql, /bronze_historical_records_dataset_ref_idx/);
  assert.match(sql, /idx_bronze_historical_dataset_ref/);
  assert.match(sql, /is distinct from/);
  assert.match(sql, /raise exception 'bronze_duplicate_index_definition_mismatch'/);
  assert.ok(sql.includes('drop index public.idx_bronze_historical_dataset_ref'));
  assert.doesNotMatch(sql, /drop (?:table|schema)/i);
});


test('FIDC human review migration enforces source, role, append-only audit and no automatic promotion', () => {
  const path = new URL('../db/neon/20261019_neon_fidc_assignor_human_review_log_v5.sql', import.meta.url);
  const sql = readFileSync(path, 'utf8');
  assert.match(sql, /create table if not exists public\.fidc_assignor_human_reviews_v5/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /before update or delete on public\.fidc_assignor_human_reviews_v5/i);
  assert.match(sql, /fidc_review_history_is_immutable/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /request\.jwt\.claim\.sub/);
  assert.match(sql, /u\.role = 'god_mode'/);
  assert.match(sql, /u\.status = 'active'/);
  assert.match(sql, /from public\.fidc_assignor_commercial_review_v5/i);
  assert.match(sql, /fidc_review_identity_referral_requires_active_operating_registry/);
  assert.match(sql, /'needs_evidence','no_go','refer_to_identity_review'/);
  assert.doesNotMatch(sql, /update public\.(?:companies|pipeline|qualification_snapshots|score_snapshots)/i);
  assert.doesNotMatch(sql, /insert into public\.(?:companies|pipeline|qualification_snapshots|score_snapshots)/i);
  assert.ok(APPROVED_V5_PENDING_MIGRATIONS.includes('db/neon/20261019_neon_fidc_assignor_human_review_log_v5.sql'));
});

test('FIDC audit migration uses valid dollar-quoted PL/pgSQL bodies', () => {
  const sql = readFileSync(new URL('../db/neon/20261019_neon_fidc_assignor_human_review_log_v5.sql', import.meta.url), 'utf8');
  const delimiters = sql.match(/\$\$/g) ?? [];
  assert.equal(delimiters.length, 4, 'two PL/pgSQL functions must have balanced dollar quotes');
  assert.match(sql, /reject_fidc_assignor_review_mutation_v5\(\)[\s\S]*?as \$\$\s*begin/);
  assert.match(sql, /record_fidc_assignor_human_review_v5\([\s\S]*?as \$\$\s*declare/);
  assert.doesNotMatch(sql, /\bas \$\s*\n/i, 'a single dollar sign is not a PL/pgSQL delimiter');
});


test('A2 official credit sources seed only unapproved candidates, never fictional opportunities', () => {
  const sql = readFileSync(new URL('../db/neon/20261019_neon_official_credit_diligence_a2.sql', import.meta.url), 'utf8');
  assert.ok(APPROVED_V5_PENDING_MIGRATIONS.includes('db/neon/20261019_neon_official_credit_diligence_a2.sql'));
  assert.match(sql, /insert into public\.discovered_company_candidates/i);
  assert.match(sql, /public\.is_valid_cnpj_checksum/);
  assert.match(sql, /'sp_fintech_credit_receivables'/);
  assert.match(sql, /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/i);
  assert.match(sql, /'captured'/);
  assert.match(sql, /'NOT_APPROVED'/);
  assert.match(sql, /'funding_gap','unknown'/);
  assert.match(sql, /'receivables_ownership','unknown'/);
  assert.match(sql, /'human_identity_review_required',true/);
  assert.match(sql, /where company_name='Creditas'/i);
  assert.match(sql, /source_url='https:\/\/www\.kaszek\.com\/companies'/i);
  for (const identity of ['16581207000137', '19540550000121', '27852506000185', '11275560000175','32997490000139']) {
    assert.ok(sql.includes(identity), `Expected primary-source CNPJ ${identity}`);
  }
  for (const source of ['www.vocedm.com.br','central.ajuda.asaas.com','meutudo.com.br/parati','recargapay.com.br/terms/emprestimo','creditas.com/legal/termos-condicoes']) {
    assert.ok(sql.includes(source), `Missing legal primary source ${source}`);
  }
  assert.doesNotMatch(sql, /(?:insert into|update) public\.(?:companies|pipeline|qualification_snapshots|score_snapshots|lead_score_snapshots|ranking_v2|user_profiles)/i);
  assert.doesNotMatch(sql, /'promoted'\s*,\s*'official-terms:/i);
});
