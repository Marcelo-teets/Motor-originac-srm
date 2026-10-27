import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateQualificationProvenance, normalizeAggregate,
} from './qualification-provenance-preflight.mjs';

const aggregate = (overrides = {}) => ({
  total: '1090', distinct_companies: '24', orphan_company_refs: '0',
  known_automated: '1027', unattributed: '63', other_unverified: '0',
  evidence_present: '1090', score_present: '1090', ...overrides,
});

test('historical machine and unattributed snapshots never count as human approvals', () => {
  const report = evaluateQualificationProvenance(aggregate(), aggregate({
    total: '0', distinct_companies: '0', known_automated: '0',
    unattributed: '0', evidence_present: '0', score_present: '0',
  }));
  assert.equal(report.supabase.total, 1090);
  assert.equal(report.supabase.knownAutomated, 1027);
  assert.equal(report.supabase.unattributed, 63);
  assert.equal(report.supabase.orphanCompanyReferences, 0);
  assert.equal(report.neon.total, 0);
  assert.equal(report.cutoverApproved, false);
  assert.equal(report.historicalSnapshotsAcceptedAsHumanReviews, false);
  assert.equal(report.readOnly, true);
});

test('unrecognized creator labels are unverified, not inferred human approvals', () => {
  const report = evaluateQualificationProvenance(aggregate({
    known_automated: '1026', other_unverified: '1',
  }), aggregate());
  assert.equal(report.supabase.otherUnverified, 1);
  assert.equal(report.historicalSnapshotsAcceptedAsHumanReviews, false);
});

test('malformed or inconsistent aggregates fail closed', () => {
  assert.throws(() => normalizeAggregate(aggregate({ known_automated: '1028' })),
    /partition/);
  assert.throws(() => normalizeAggregate(aggregate({ total: '-1' })), /Invalid/);
  assert.throws(() => normalizeAggregate(aggregate({ total: 'NaN' })), /Invalid/);
  assert.throws(() => normalizeAggregate(aggregate({ orphan_company_refs: '1091' })), /exceeds total/);
});

test('audit SQL is read-only and outputs only aggregate statistics', () => {
  const source = readFileSync(new URL('./qualification-provenance-preflight.mjs', import.meta.url), 'utf8');
  assert.match(source, /BEGIN TRANSACTION READ ONLY/);
  assert.match(source, /count\(\*\)::bigint/);
  assert.match(source, /assertAuditConnections/);
  assert.doesNotMatch(source, /\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\b|\bCREATE TABLE\b|\bDROP TABLE\b/i);
  assert.doesNotMatch(source, /console\.log\(.*(?:rows|url|connectionString)/);
});
