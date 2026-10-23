import test from 'node:test';
import assert from 'node:assert/strict';
import { buildA2DiligenceReport, collectA2DiligenceReport } from './a2-diligence-report.mjs';

const source = {
  company_name: 'Jeitto', cnpj: '20.937.849/0001-01',
  candidate_status: 'captured', source_url: 'https://jeitto.com.br/terms/termos-e-condicoes-de-uso',
  raw_payload: {
    commercial_queue: false, companyMasterPromotionAuthorized: false,
    humanApprovalRequired: true, portfolioOwnership: 'unknown',
    fundingGap: 'unknown', ticketFit: 'unknown', nextDiligence: 'Identificar credora da CCB',
  },
  metadata: { approval_status: 'NOT_APPROVED' },
};
test('A2 evidence report keeps human gate and source lineage', () => {
  const report = buildA2DiligenceReport([source], '2026-10-23T12:00:00.000Z');
  assert.equal(report.total, 1);
  assert.equal(report.pending, 1);
  assert.equal(report.sourceBacked, 1);
  assert.equal(report.candidates[0].creditQualificationAuthorized, false);
  assert.deepEqual(report.candidates[0].openEvidence, ['portfolioOwnership','fundingGap','ticketFit']);
  assert.equal(report.candidates[0].cnpj, '20937849000101');
  assert.ok(!JSON.stringify(report).includes('raw_payload'));
});
test('unexpected promotion or missing controls always require governance review', () => {
  const promoted = buildA2DiligenceReport([{ ...source, candidate_status:'promoted' }]);
  assert.equal(promoted.pending, 0);
  assert.equal(promoted.candidates[0].status, 'requires_governance_review');
  const incomplete = buildA2DiligenceReport([{ ...source, raw_payload: {} }]);
  assert.equal(incomplete.pending, 0);
});
test('identity collision and invalid URL cannot count as source-backed diligence', () => {
  assert.throws(() => buildA2DiligenceReport([source, source]), /Duplicate/);
  const report = buildA2DiligenceReport([{ ...source, source_url:'http://example.com' }]);
  assert.equal(report.sourceBacked, 0);
  assert.equal(report.candidates[0].sourceUrl, null);
});
test('connection rejects external or absent database before query', async () => {
  await assert.rejects(collectA2DiligenceReport('postgresql://a:b@localhost/db'), /Canonical Neon/);
  await assert.rejects(collectA2DiligenceReport(''), /Neon connection required/);
});
