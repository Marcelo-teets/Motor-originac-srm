import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planCompanyMasterStage, assertStagingNotProduction,
  assertStagingBaselineMatchesProduction,
} from './company-master-staging.mjs';

const uuid = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
const src = (n = 1, overrides = {}) => ({
  id: uuid(n), cnpj: '11222333000181', domain: 'one.example.br',
  legal_name: 'Example Company', credit_product: true, fit_fidc: true,
  has_fidc: true, total_score: 99, ...overrides,
});
const other = (n = 2, overrides = {}) => src(n,
  {cnpj: '11444777000161', domain: 'other.example.br', ...overrides});

test('valid identity is eligible for staging but credit data is never included', () => {
  const plan = planCompanyMasterStage([src()], [other()]);
  assert.equal(plan.report.eligible, 1);
  assert.equal(plan.report.migrationApproved, false);
  assert.equal(plan.report.productionWriteAllowed, false);
  assert.equal(plan.report.creditApprovalImported, false);
  assert.equal(plan.records[0].metadata.creditReviewRequired, true);
  for (const key of ['credit_product', 'fit_fidc', 'has_fidc',
    'total_score', 'commercial_owner_id', 'created_by']) {
    assert.equal(Object.hasOwn(plan.records[0], key), false);
  }
});

test('invalid CNPJ, missing host, missing legal name cannot enter staging', () => {
  const input = [
    src(1, {cnpj: '11222333000182'}),
    src(2, {domain: '', website_url: null, website: null}),
    src(3, {cnpj: '11444777000161', domain: 'third.example.br', legal_name: null}),
  ];
  const plan = planCompanyMasterStage(input, []);
  assert.equal(plan.report.invalidIdentity, 3);
  assert.equal(plan.records.length, 0);
});

test('source duplicates and target identity collisions fail closed', () => {
  const duplicated = planCompanyMasterStage([
    src(), src(2, {domain: 'duplicate.example.br'}),
  ], []);
  assert.equal(duplicated.report.duplicatedSourceIdentity, 2);
  const sameDomain = planCompanyMasterStage([src()], [other(3, {domain: 'one.example.br'})]);
  assert.equal(sameDomain.report.collidingTargetIdentity, 1);
  const sameUuid = planCompanyMasterStage([src()], [other(1)]);
  assert.equal(sameUuid.report.collidingTargetIdentity, 1);
});

test('repeat staging is idempotent and does not stage twice', () => {
  const x = src();
  const plan = planCompanyMasterStage([x], [{
    ...x, metadata: {recoverySource: 'supabase', creditReviewRequired: true},
  }]);
  assert.equal(plan.report.alreadyStaged, 1);
  assert.equal(plan.records.length, 0);
});

test('production host or pooler alias cannot be staging', () => {
  const production = 'postgresql://user:secret@ep-motor.sa-east-1.aws.neon.tech/neondb';
  const staging = 'postgresql://user:secret@ep-staging.sa-east-1.aws.neon.tech/neondb';
  assert.doesNotThrow(() => assertStagingNotProduction(production, staging));
  assert.throws(() => assertStagingNotProduction(production, production),
    /Refusing production/);
  assert.throws(() => assertStagingNotProduction(production,
    'postgresql://user:secret@ep-motor-pooler.sa-east-1.aws.neon.tech/neondb'),
    /Refusing production/);
  assert.throws(() => assertStagingNotProduction(production,
    'postgresql://user:secret@localhost/neondb'), /must be Neon/);
});

test('staging baseline must match production exactly', () => {
  assert.doesNotThrow(() => assertStagingBaselineMatchesProduction([src()], [src()]));
  assert.throws(() => assertStagingBaselineMatchesProduction([src()], []),
    /Staging baseline differs/);
  assert.throws(() => assertStagingBaselineMatchesProduction(
    [src()], [src(1, {domain: 'another.example.br'})]),
    /Staging baseline differs/);
});

test('CLI outputs aggregates only, and uses rollback on failure', () => {
  const source = readFileSync(new URL('./company-master-staging.mjs', import.meta.url), 'utf8');
  assert.match(source, /BEGIN TRANSACTION READ ONLY/);
  assert.match(source, /MOTOR_NEON_STAGING_DATABASE_URL/);
  assert.match(source, /MOTOR_RECOVERY_ALLOW_STAGING/);
  assert.match(source, /ROLLBACK/);
  assert.match(source, /console\.log\(JSON\.stringify\(result/);
  assert.doesNotMatch(source, /console\.log\(.*records|console\.log\(.*sourceRows/);
});
