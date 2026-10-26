import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const COHORT = 'fidc_dcm_first_party_credit_v5';
const REQUIRED_FIELDS = ['portfolioOwnership', 'fundingGap', 'ticketFit'];
const REVIEW_BASE_URL = 'https://motor-originac-srm.vercel.app/identity-review?candidateId=';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const markdownCell = (value) => String(value ?? '').replace(/[\\|<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
const normalizeCnpj = (value) => String(value ?? '').toUpperCase().replace(/[.\/\-\s]/g, '');
const cleanUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' && url.username === '' && url.password === '' ? url.href : null;
  } catch { return null; }
};

// A commercial review queue, NOT a credit scoring or auto-approval engine.
// Do not expose raw_payload (potentially proprietary) in the exported report.
export function buildA2DiligenceReport(rows, generatedAt = new Date().toISOString()) {
  assert.ok(Array.isArray(rows), 'Candidate rows are required');
  assert.ok(Number.isFinite(Date.parse(generatedAt)), 'Invalid report timestamp');
  const seen = new Set();
  const candidates = rows.map((row) => {
    const candidateId = String(row.id ?? '').trim();
    assert.match(candidateId, UUID_PATTERN, 'Invalid canonical candidate identifier');
    const cnpj = normalizeCnpj(row.cnpj);
    assert.match(cnpj, /^[A-Z0-9]{12}[0-9]{2}$/, 'Invalid candidate CNPJ identity');
    assert.ok(!seen.has(cnpj), 'Duplicate A2 candidate identity');
    seen.add(cnpj);
    const payload = row.raw_payload ?? {};
    const metadata = row.metadata ?? {};
    const sourceUrl = cleanUrl(row.source_url);
    const withheld = payload.commercial_queue !== false
      || payload.companyMasterPromotionAuthorized !== false
      || payload.humanApprovalRequired !== true
      || row.candidate_status !== 'captured'
      || metadata.approval_status === 'APPROVED';
    const missing = REQUIRED_FIELDS.filter((field) => payload[field] !== 'verified');
    return {
      company: String(row.company_name ?? '').trim(),
      candidateId,
      reviewUrl: REVIEW_BASE_URL + encodeURIComponent(candidateId),
      cnpj,
      sourceUrl,
      sourceBacked: Boolean(sourceUrl),
      researchCohort: COHORT,
      status: withheld ? 'requires_governance_review' : 'pending_human_diligence',
      creditQualificationAuthorized: false,
      openEvidence: missing,
      nextAction: String(payload.nextDiligence || 'Validar entidade credora, titularidade, carteira, funding e ticket').slice(0, 400),
    };
  }).sort((a, b) => a.company.localeCompare(b.company, 'pt-BR'));
  return {
    schema: 'motor.a2.diligence-report.1',
    generatedAt,
    source: 'neon.production.discovered_company_candidates',
    purpose: 'human_identity_and_credit_diligence_only',
    total: candidates.length,
    sourceBacked: candidates.filter((candidate) => candidate.sourceBacked).length,
    pending: candidates.filter((candidate) => candidate.status === 'pending_human_diligence').length,
    candidates,
    warnings: [
      'This report does not validate creditor ownership, available loan tape, assignability, funding gap or economic ticket.',
      'Company Master promotion, credit review, scores and pipeline remain human and evidence gated.',
    ],
  };
}

export const formatA2DiligenceSummary = (report) => [
  '## Motor — diligência humana de cinco candidatas A2',
  '',
  'Origem: Neon canônico, leitura somente. Links de fonte **cadastrados**, não validados como prova de funding ou titularidade.',
  '',
  'Candidatas: **' + report.total + '**; pendentes: **' + report.pending + '**; com URL cadastrada: **' + report.sourceBacked + '**.',
  '',
  '| Empresa / CNPJ | Fonte registrada | Pendências | Próxima ação | Fluxo institucional |',
  '| --- | --- | --- | --- | --- |',
  ...report.candidates.map(candidate =>
    '| ' + markdownCell(candidate.company) + ' / ' + markdownCell(candidate.cnpj)
    + ' | ' + (candidate.sourceUrl ? '[Abrir fonte](' + candidate.sourceUrl.replace(/[()|<>]/g, encodeURIComponent) + ')' : 'Não cadastrada')
    + ' | ' + markdownCell(candidate.openEvidence.join(', '))
    + ' | ' + markdownCell(candidate.nextAction)
    + ' | [Revisar identidade](' + candidate.reviewUrl + ') |'
  ),
  '',
  '**Controle:** identidade aprovada não significa qualificação creditícia. Crédito, cessibilidade, funding gap e ticket exigem evidências e revisão humana antes de score/ranking/pipeline.',
  '',
].join('\n');

export async function collectA2DiligenceReport(connectionString) {
  assert.ok(typeof connectionString === 'string' && connectionString.length > 0, 'Neon connection required');
  const parsed = new URL(connectionString);
  assert.ok(parsed.hostname.endsWith('.neon.tech'), 'Canonical Neon database required');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 8000, statement_timeout: 12000 });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const { rows } = await client.query(`
      select id, company_name, cnpj, candidate_status, source_url, raw_payload, metadata
      from public.discovered_company_candidates
      where metadata->>'researchCohort' = $1
      order by company_name, cnpj
      limit 100
    `, [COHORT]);
    const report = buildA2DiligenceReport(rows);
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await collectA2DiligenceReport(process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL);
    if (process.env.A2_REPORT_PATH) writeFileSync(process.env.A2_REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatA2DiligenceSummary(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
