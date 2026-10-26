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

test('first-party credit research adds only unapproved, source-linked identity candidates', () => {
  const sql = readFileSync(new URL('../db/neon/20261019_neon_first_party_credit_research_candidates_v5.sql', import.meta.url), 'utf8');
  assert.match(sql, /insert into public\.discovered_company_candidates/i);
  assert.match(sql, /'commercial_queue', false/);
  assert.match(sql, /'humanApprovalRequired', true/);
  assert.match(sql, /'identity_review_status', 'pending'/);
  assert.match(sql, /'fundingGap', 'unknown'/);
  assert.match(sql, /'portfolioOwnership', 'unknown'/);
  assert.match(sql, /'ticketFit', 'unknown'/);
  assert.match(sql, /'formalRegistryStatus', 'unverified'/);
  assert.match(sql, /on conflict \(dedupe_key\) where dedupe_key is not null do nothing/i);
  assert.match(sql, /and not exists \(/i);
  for (const cnpj of ['19540550000121','91669747000192','27852506000185','44431743000191']) {
    assert.ok(sql.includes(cnpj), `missing documented legal entity ${cnpj}`);
  }
  assert.doesNotMatch(sql, /insert into public\.(?:companies|qualification_snapshots|score_snapshots|lead_score_snapshots|ranking_v2|pipeline)/i);
  assert.doesNotMatch(sql, /update public\.(?:companies|qualification_snapshots|score_snapshots|lead_score_snapshots|ranking_v2|pipeline)/i);
  assert.ok(APPROVED_V5_PENDING_MIGRATIONS.includes('db/neon/20261019_neon_first_party_credit_research_candidates_v5.sql'));
});


test('A2 complementary payment entities and Creditas preserve unapproved source lineage', () => {
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
  for (const identity of ['16581207000137', '11275560000175','32997490000139']) {
    assert.ok(sql.includes(identity), `Expected primary-source CNPJ ${identity}`);
  }
  for (const source of ['www.vocedm.com.br','recargapay.com.br/terms/emprestimo','creditas.com/legal/termos-condicoes']) {
    assert.ok(sql.includes(source), `Missing legal primary source ${source}`);
  }
  assert.doesNotMatch(sql, /(?:insert into|update) public\.(?:companies|pipeline|qualification_snapshots|score_snapshots|lead_score_snapshots|ranking_v2|user_profiles)/i);
  assert.doesNotMatch(sql, /'promoted'\s*,\s*'official-terms:/i);
});

test('A2 legal-source identities cannot be auto-promoted by the deterministic resolver', () => {
  const file = 'db/neon/20261019_neon_a2_human_identity_autoresolver_guard.sql';
  assert.ok(APPROVED_V5_PENDING_MIGRATIONS.includes(file), 'New resolver gate must be reviewed in release allowlist');
  const sql = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(sql, /pg_get_functiondef\(/);
  assert.match(sql, /public\.auto_resolve_verified_candidate_entities_v4\(integer\)/);
  assert.match(sql, /candidate_decision_queue_v4/);
  assert.match(sql, /human_identity_review_required/);
  assert.match(sql, /official_corporate_terms,human_identity_review_required/);
  assert.match(sql, /commercial_queue/);
  assert.match(sql, /humanApprovalRequired/);
  assert.match(sql, /companyMasterPromotionAuthorized/);
  assert.match(sql, /identity_review_status/);
  assert.match(sql, /refuse_unreviewed_patch/);
  assert.match(sql, /lower\(coalesce\(c\.raw_payload->>'human_identity_review_required','false'\)\) <> 'true'/);
  assert.match(sql, /lower\(coalesce\(c\.raw_payload->>'commercial_queue','true'\)\) <> 'false'/);
  assert.doesNotMatch(sql, /(?:insert|update|delete)\s+(?:into|from)?\s*public\.(?:companies|pipeline|qualification_snapshots|score_snapshots|lead_score_snapshots|ranking_v2)/i);
  assert.doesNotMatch(sql, /drop\s+(?:table|schema)/i);
});

test('A2 official credit entities remain human-review-pending across discovery inputs', () => {
  const firstParty = readFileSync(new URL('../db/neon/20261019_neon_first_party_credit_research_candidates_v5.sql', import.meta.url), 'utf8');
  const followUp = readFileSync(new URL('../db/neon/20261019_neon_official_credit_diligence_a2.sql', import.meta.url), 'utf8');
  assert.match(firstParty, /'humanApprovalRequired',\s*true/);
  assert.match(firstParty, /'companyMasterPromotionAuthorized',\s*false/);
  assert.match(firstParty, /'identity_review_status',\s*'pending'/);
  assert.match(firstParty, /'commercial_queue',\s*false/);
  assert.match(followUp, /'human_identity_review_required',true/);
  assert.match(followUp, /'commercial_queue',false/);
  for (const sql of [firstParty, followUp]) {
    assert.doesNotMatch(sql, /'funding_gap','verified'/);
    assert.doesNotMatch(sql, /update public\.companies/i);
  }
});

test('Jeitto source-backed CCB candidate is not automatically qualified or promoted', () => {
  const file = 'db/neon/20261022_neon_jeitto_first_party_credit_candidate_a2.sql';
  assert.ok(APPROVED_V5_PENDING_MIGRATIONS.includes(file), 'Jeitto evidence must be reviewed in the migration allowlist');
  const sql = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.match(sql, /20937849000101/);
  assert.match(sql, /https:\/\/jeitto\.com\.br\/terms\/termos-e-condicoes-de-uso/);
  assert.match(sql, /public\.is_valid_cnpj_checksum\(s\.cnpj\)/);
  assert.match(sql, /'commercial_queue', false/);
  assert.match(sql, /'human_identity_review_required', true/);
  assert.match(sql, /'humanApprovalRequired', true/);
  assert.match(sql, /'companyMasterPromotionAuthorized', false/);
  assert.match(sql, /'identity_review_status', 'pending'/);
  assert.match(sql, /'portfolioOwnership', 'unknown'/);
  assert.match(sql, /'fundingGap', 'unknown'/);
  assert.match(sql, /'ticketFit', 'unknown'/);
  assert.match(sql, /'approval_status', 'NOT_APPROVED'/);
  assert.match(sql, /and not exists \(/i);
  assert.match(sql, /on conflict \(dedupe_key\) where dedupe_key is not null do nothing/i);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:companies|company_credit_reviews|qualification_snapshots|score_snapshots|lead_score_snapshots|ranking_v2|pipeline|user_profiles)/i);
  assert.doesNotMatch(sql, /(?:drop|truncate)\s+(?:table|schema)/i);
});

test('Neon SQL requires explicit and consistent human credit assessments at finalization', () => {
  const file = 'db/neon/20261026_neon_credit_review_finalization_evidence_guard.sql';
  assert.ok(APPROVED_V5_PENDING_MIGRATIONS.includes(file));
  const sql = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.ok(sql.includes('security invoker'));
  assert.ok(sql.includes("new.status not in ('approved', 'rejected')"));
  assert.ok(sql.includes("jsonb_typeof(new.review_payload->v_field)"));
  assert.ok(sql.includes("new.review_payload->v_field is distinct from v_stored"));
  assert.ok(sql.includes("new.review_payload->'confidence' is distinct from to_jsonb(new.confidence)"));
  for (const field of ['hasCreditProduct','creditIsCore','hasReceivables','receivablesStructurable',
    'hasFidc','usesStructuredDebt','fitFidc','fitDcm','structuralScore',
    'capitalScore','receivablesScore','executionScore','timingScore']) {
    assert.ok(sql.includes("'" + field + "'"), 'Missing reviewed field: ' + field);
  }
  assert.ok(sql.includes('before insert or update'));
  assert.ok(sql.includes('on public.company_credit_reviews'));
});
