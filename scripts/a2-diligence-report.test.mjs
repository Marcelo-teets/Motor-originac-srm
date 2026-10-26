import test from 'node:test';
import assert from 'node:assert/strict';
import { buildA2DiligenceReport, collectA2DiligenceReport, formatA2DiligenceSummary } from './a2-diligence-report.mjs';

const source = {
  id: '00000000-0000-4000-8000-000000000001',
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

test('human dossier links to existing candidate identity workflow without approving credit', () => {
  const report = buildA2DiligenceReport([source], '2026-10-26T13:00:00Z');
  const candidate = report.candidates[0];
  assert.equal(candidate.reviewUrl, 'https://motor-originac-srm.vercel.app/identity-review?candidateId=00000000-0000-4000-8000-000000000001');
  assert.equal(candidate.creditQualificationAuthorized, false);
  const summary = formatA2DiligenceSummary(report);
  assert.match(summary, /\[Revisar identidade\]\(https:\/\/motor-originac-srm\.vercel\.app\/identity-review\?candidateId=/);
  assert.match(summary, /Links de fonte \*\*cadastrados\*\*/);
  assert.ok(summary.includes('\n| Empresa / CNPJ |'));
  assert.ok(!summary.includes('raw_payload'));
});
test('candidate identifiers are mandatory and Markdown cannot inject new rows', () => {
  assert.throws(() => buildA2DiligenceReport([{ ...source, id: '../other' }]), /Invalid canonical candidate identifier/);
  const report = buildA2DiligenceReport([{ ...source, company_name: 'Teste | linha\nquebrada', raw_payload: { ...source.raw_payload, nextDiligence: 'Buscar | evidência\nno contrato' } }]);
  const summary = formatA2DiligenceSummary(report);
  assert.equal(summary.split('\n').filter(line => line.startsWith('| ')).length, 2);
  assert.match(summary, /Teste   linha quebrada/);
  assert.ok(!summary.includes('Buscar | evidência'));
});
