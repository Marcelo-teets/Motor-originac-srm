import { getSupabaseClient } from './supabase.js';
import { stableTextKey, type PeopleCapitalCapture } from './peopleCapitalSignals.js';

export type PeopleCapitalCaptureEnvelope = {
  sourceId: string;
  sourceCode: string;
  capture: PeopleCapitalCapture;
};

export type PeopleCapitalPersistenceDiagnostics = {
  metricSnapshots: number;
  jobOpenings: number;
  closedJobOpenings: number;
  investorRelationships: number;
  skipped: boolean;
  error?: string;
};

const normalizeName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const periodStart = (observedAt: string, periodLabel: 'month' | 'quarter' | 'unknown') => {
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime()) || periodLabel === 'unknown') return null;
  date.setUTCMonth(date.getUTCMonth() - (periodLabel === 'quarter' ? 3 : 1));
  return date.toISOString();
};

export const persistPeopleCapitalCaptures = async (params: {
  companyId: string;
  captures: PeopleCapitalCaptureEnvelope[];
}): Promise<PeopleCapitalPersistenceDiagnostics> => {
  const client = getSupabaseClient();
  if (!client || !params.captures.length) return {
    metricSnapshots: 0,
    jobOpenings: 0,
    closedJobOpenings: 0,
    investorRelationships: 0,
    skipped: true,
  };

  const diagnostics: PeopleCapitalPersistenceDiagnostics = {
    metricSnapshots: 0,
    jobOpenings: 0,
    closedJobOpenings: 0,
    investorRelationships: 0,
    skipped: false,
  };

  try {
    for (const envelope of params.captures) {
      const { sourceId, sourceCode, capture } = envelope;
      const metricRows: Record<string, unknown>[] = [];

      if (capture.headcount) {
        const start = periodStart(capture.headcount.observedAt, capture.headcount.periodLabel);
        metricRows.push({
          company_id: params.companyId,
          source_id: sourceId,
          metric_key: 'headcount_total',
          metric_value: capture.headcount.total,
          metric_unit: 'employees',
          observed_at: capture.headcount.observedAt,
          period_start: start,
          period_end: capture.headcount.observedAt,
          confidence_score: capture.headcount.confidenceScore,
          observed_vs_inferred: 'observed',
          raw_payload: {
            sourceCode,
            sourceUrl: capture.headcount.sourceUrl,
            evidenceText: capture.headcount.evidenceText,
            periodLabel: capture.headcount.periodLabel,
          },
        });
        if (capture.headcount.growthPct !== null) metricRows.push({
          company_id: params.companyId,
          source_id: sourceId,
          metric_key: 'headcount_growth_pct',
          metric_value: capture.headcount.growthPct,
          metric_unit: 'percent',
          observed_at: capture.headcount.observedAt,
          period_start: start,
          period_end: capture.headcount.observedAt,
          confidence_score: capture.headcount.confidenceScore,
          observed_vs_inferred: 'observed',
          raw_payload: {
            sourceCode,
            sourceUrl: capture.headcount.sourceUrl,
            evidenceText: capture.headcount.evidenceText,
            periodLabel: capture.headcount.periodLabel,
          },
        });
        if (capture.headcount.inferredPreviousTotal !== null && start) metricRows.push({
          company_id: params.companyId,
          source_id: sourceId,
          metric_key: 'headcount_total_inferred_previous',
          metric_value: capture.headcount.inferredPreviousTotal,
          metric_unit: 'employees',
          observed_at: capture.headcount.observedAt,
          period_start: start,
          period_end: capture.headcount.observedAt,
          confidence_score: Math.max(0.45, capture.headcount.confidenceScore - 0.15),
          observed_vs_inferred: 'inferred',
          raw_payload: {
            sourceCode,
            sourceUrl: capture.headcount.sourceUrl,
            derivedFromReportedGrowthPct: capture.headcount.growthPct,
            derivedFromReportedTotal: capture.headcount.total,
          },
        });
      }

      if (capture.jobs.length || sourceCode === 'src_company_careers') {
        const roleCounts = capture.jobs.reduce<Record<string, number>>((acc, job) => {
          acc[job.roleFamily] = (acc[job.roleFamily] ?? 0) + 1;
          return acc;
        }, {});
        const strategicCount = capture.jobs.filter((job) => job.dcmRelevanceScore >= 60).length;
        metricRows.push(
          {
            company_id: params.companyId, source_id: sourceId, metric_key: 'open_jobs_total', metric_value: capture.jobs.length,
            metric_unit: 'openings', observed_at: capture.collectedAt, confidence_score: capture.connectorStatus === 'real' ? 0.86 : 0.5,
            observed_vs_inferred: 'observed', raw_payload: { sourceCode, sourceUrl: capture.sourceUrl },
          },
          {
            company_id: params.companyId, source_id: sourceId, metric_key: 'open_jobs_credit_risk_dcm', metric_value: strategicCount,
            metric_unit: 'openings', observed_at: capture.collectedAt, confidence_score: capture.connectorStatus === 'real' ? 0.86 : 0.5,
            observed_vs_inferred: 'observed', raw_payload: { sourceCode, sourceUrl: capture.sourceUrl, roleCounts },
          },
        );
        for (const [roleFamily, count] of Object.entries(roleCounts)) metricRows.push({
          company_id: params.companyId,
          source_id: sourceId,
          metric_key: `open_jobs_role_${roleFamily}`,
          metric_value: count,
          metric_unit: 'openings',
          observed_at: capture.collectedAt,
          confidence_score: capture.connectorStatus === 'real' ? 0.86 : 0.5,
          observed_vs_inferred: 'observed',
          raw_payload: { sourceCode, sourceUrl: capture.sourceUrl },
        });
      }

      if (metricRows.length) {
        await client.upsert(
          'company_source_metric_snapshots',
          metricRows,
          'company_id,source_id,metric_key,observed_at',
        );
        diagnostics.metricSnapshots += metricRows.length;
      }

      if (sourceCode === 'src_company_careers' && capture.connectorStatus === 'real') {
        const rows = capture.jobs.map((job) => ({
          company_id: params.companyId,
          source_id: sourceId,
          external_job_id: job.externalJobId,
          title: job.title,
          normalized_title: job.normalizedTitle,
          role_family: job.roleFamily,
          seniority: job.seniority,
          location: job.location,
          employment_type: job.employmentType,
          source_url: job.sourceUrl,
          opened_at: job.openedAt,
          first_seen_at: capture.collectedAt,
          last_seen_at: capture.collectedAt,
          closed_at: null,
          status: 'open',
          dcm_relevance_score: job.dcmRelevanceScore,
          credit_relevance_score: job.creditRelevanceScore,
          confidence_score: job.confidenceScore,
          raw_payload: { ...job.rawPayload, sourceCode },
        }));
        if (rows.length) {
          await client.upsert('company_job_openings', rows, 'company_id,source_id,external_job_id');
          diagnostics.jobOpenings += rows.length;
        }

        const existing = await client.select('company_job_openings', {
          select: 'id,external_job_id,status',
          filters: [
            { column: 'company_id', value: params.companyId },
            { column: 'source_id', value: sourceId },
            { column: 'status', value: 'open' },
          ],
        }) as Array<{ id: string; external_job_id: string; status: string }>;
        const seen = new Set(capture.jobs.map((job) => job.externalJobId));
        for (const row of existing) {
          if (seen.has(row.external_job_id)) continue;
          await client.update('company_job_openings', {
            status: 'closed',
            closed_at: capture.collectedAt,
            last_seen_at: capture.collectedAt,
          }, [{ column: 'id', value: row.id }]);
          diagnostics.closedJobOpenings += 1;
        }
      }

      for (const relationship of capture.investors) {
        const normalizedName = normalizeName(relationship.investorName);
        if (!normalizedName) continue;
        const investorRows = await client.upsert('investors', [{
          name: relationship.investorName,
          normalized_name: normalizedName,
          investor_type: 'unknown',
          metadata: { lastSourceCode: sourceCode, lastSourceUrl: relationship.sourceUrl },
          updated_at: capture.collectedAt,
        }], 'normalized_name') as Array<{ id: string }>;
        const investorId = investorRows[0]?.id;
        if (!investorId) continue;
        const relationshipKey = stableTextKey([
          params.companyId,
          investorId,
          relationship.relationshipType,
          relationship.roundStage ?? '',
          relationship.announcedAt ?? '',
          relationship.sourceUrl,
        ].join('|'));
        await client.upsert('company_investor_relationships', [{
          relationship_key: relationshipKey,
          company_id: params.companyId,
          investor_id: investorId,
          source_id: sourceId,
          relationship_type: relationship.relationshipType,
          round_stage: relationship.roundStage,
          round_amount: relationship.roundAmount,
          round_currency: relationship.roundCurrency,
          is_lead: relationship.isLead,
          announced_at: relationship.announcedAt,
          observed_at: capture.collectedAt,
          source_url: relationship.sourceUrl,
          confidence_score: relationship.confidenceScore,
          evidence_payload: { evidenceText: relationship.evidenceText, sourceCode },
        }], 'relationship_key');
        diagnostics.investorRelationships += 1;
      }
    }
    return diagnostics;
  } catch (error) {
    return {
      ...diagnostics,
      error: error instanceof Error ? error.message : 'unknown_people_capital_persistence_error',
    };
  }
};
