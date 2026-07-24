import { getSupabaseClient } from '../backend/src/lib/supabase.js';
import { createPlatformRepository } from '../backend/src/repositories/platformRepository.js';
import { PlatformService } from '../backend/src/services/platformService.js';

const companyId = String(process.env.COMPANY_ID ?? '').trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewRow = Record<string, unknown> & { id: string; company_id: string; status: string; approved_outcome?: string };
type CompanyRow = { id: string; stage?: string | null; metadata?: Record<string, unknown> | null };
type PipelineRow = { id: string; stage?: string | null; notes?: string | null };

const bool = (value: unknown) => value === true || value === 'true';
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const metadataOf = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

async function syncApprovedReview() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client is unavailable.');
  const reviews = await client.select('company_credit_reviews', {
    select: '*',
    filters: [
      { column: 'company_id', value: companyId },
      { column: 'status', value: 'approved' },
    ],
    orderBy: { column: 'review_version', ascending: false },
    limit: 1,
  }) as ReviewRow[];
  const review = reviews[0];
  if (!review || review.approved_outcome !== 'eligible') {
    throw new Error('Approved eligible company credit review is required.');
  }

  const companies = await client.select('companies', {
    select: 'id,stage,metadata',
    filters: [{ column: 'id', value: companyId }],
    limit: 1,
  }) as CompanyRow[];
  const company = companies[0];
  if (!company) throw new Error('Company not found.');

  const metadata = {
    ...metadataOf(company.metadata),
    credit_review_id: review.id,
    credit_review_version: review.review_version,
    credit_review_status: review.status,
    credit_review_outcome: review.approved_outcome,
    credit_reviewed_at: review.reviewed_at ?? null,
    qualification_status: review.approved_outcome,
    decision_eligible: true,
    decision_eligibility_reason: 'credit_review_approved',
    excluded_from_qualification: false,
    excluded_from_scoring: false,
    credit_product_type: review.credit_product_type ?? null,
    credit_is_core: review.credit_is_core ?? null,
    credit_review_has_receivables: review.has_receivables ?? null,
    receivables_structurable: review.receivables_structurable ?? null,
    receivables_type: review.receivables_type ?? [],
    receivables_recurrence_level: review.receivables_recurrence_level ?? null,
    receivables_predictability_level: review.receivables_predictability_level ?? null,
    credit_review_has_fidc: review.has_fidc ?? null,
    credit_review_uses_structured_debt: review.uses_structured_debt ?? null,
    credit_review_funding_structure_type: review.funding_structure_type ?? null,
    capital_structure_quality: review.capital_structure_quality ?? null,
    funding_gap_level: review.funding_gap_level ?? null,
    credit_review_fit_fidc: review.fit_fidc ?? null,
    credit_review_fit_dcm: review.fit_dcm ?? null,
    timing_level: review.timing_level ?? null,
    suggested_structure: review.suggested_structure ?? null,
    credit_review_structural_score: review.structural_score ?? null,
    credit_review_capital_score: review.capital_score ?? null,
    credit_review_receivables_score: review.receivables_score ?? null,
    credit_review_execution_score: review.execution_score ?? null,
    credit_review_timing_score: review.timing_score ?? null,
    credit_review_confidence: review.confidence ?? null,
    credit_review_rationale: review.rationale ?? null,
    credit_review_next_action: review.next_action ?? null,
    credit_review_evidence: review.evidence ?? [],
  };

  await client.update('companies', {
    credit_product: bool(review.has_credit_product),
    has_receivables: bool(review.has_receivables),
    has_fidc: bool(review.has_fidc),
    has_structured_debt: bool(review.uses_structured_debt),
    funding_gap: ['medium', 'medium_high', 'high'].includes(String(review.funding_gap_level ?? '')),
    fit_fidc: bool(review.fit_fidc),
    fit_dcm: bool(review.fit_dcm),
    current_funding_structure: text(review.funding_structure_type),
    stage: 'Qualified',
    metadata,
    updated_at: new Date().toISOString(),
  }, [{ column: 'id', value: companyId }]);

  return { client, review };
}

async function alignPipeline(client: NonNullable<ReturnType<typeof getSupabaseClient>>, review: ReviewRow) {
  const rows = await client.select('pipeline', {
    select: 'id,stage,notes',
    filters: [{ column: 'company_id', value: companyId }],
    limit: 1,
  }) as PipelineRow[];
  const pipeline = rows[0];
  if (!pipeline) return { status: 'not_found' };
  await client.update('pipeline', {
    stage: ['Identified', 'Qualified'].includes(String(pipeline.stage ?? '')) ? 'Qualified' : pipeline.stage,
    status: 'active',
    next_action: text(review.next_action),
    expected_structure: text(review.suggested_structure),
    notes: [pipeline.notes, `[credit_review_v1 review=${review.id}]`].filter(Boolean).join(' '),
    updated_at: new Date().toISOString(),
  }, [{ column: 'id', value: pipeline.id }]);
  return { status: 'updated', pipelineId: pipeline.id };
}

async function main() {
  if (!uuidPattern.test(companyId)) throw new Error('COMPANY_ID must be a valid UUID.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  if (process.env.USE_SUPABASE !== 'true') {
    throw new Error('USE_SUPABASE=true is required to prevent local-memory materialization.');
  }

  const { client, review } = await syncApprovedReview();
  const service = new PlatformService(createPlatformRepository('supabase'));
  const snapshots = await service.recomputeDerivedData(companyId);
  const pipeline = await alignPipeline(client, review);
  const summary = {
    companyId,
    generatedAt: snapshots.generatedAt,
    qualificationCount: snapshots.qualifications.length,
    patternCount: snapshots.patterns.length,
    scoreCount: snapshots.scoreSnapshots.length,
    leadScoreCount: snapshots.leadScoreSnapshots.length,
    pipeline,
  };

  if (summary.qualificationCount !== 1 || summary.scoreCount < 1 || summary.leadScoreCount !== 1) {
    throw new Error(`Decision materialization did not generate the expected scoped records: ${JSON.stringify(summary)}`);
  }
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
