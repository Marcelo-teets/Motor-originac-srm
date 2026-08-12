import { getSupabaseClient } from '../lib/supabase.js';
import type { CompanySignal, EnrichmentRecord, MonitoringOutput } from '../types/platform.js';
import type {
  CaptureEngineResult,
  CanonicalSourceDocument,
  TreatmentDecisionGate,
  TreatmentResultRecord,
} from '../modules/data-capture/types.js';

type RuntimeStatus = 'real' | 'partial';
type QualityGateStatus = 'allow' | 'review' | 'quarantine' | 'not_found' | 'error';

type QualityGateResult = {
  source_document_id?: string;
  gate_result?: QualityGateStatus;
  status?: string;
  source_code?: string;
  quarantine_reason?: string | null;
};

const ALLOWED_DOCUMENT_STATUSES = new Set(['allow', 'validated', 'verified']);

const asPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const stringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => pickString(item)).filter((item): item is string => Boolean(item))
  : [];

const firstItemLink = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  if (!first || typeof first !== 'object') return undefined;
  return pickString((first as Record<string, unknown>).link, (first as Record<string, unknown>).url);
};

const evidenceArrayText = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const text = value.map((item) => String(item)).filter(Boolean).join(' | ');
  return text || undefined;
};

const sourceUrlFromOutput = (output: MonitoringOutput) => pickString(
  output.normalizedPayload?.sourceUrl,
  output.normalizedPayload?.canonicalUrl,
  output.normalizedPayload?.endpoint,
  firstItemLink(output.normalizedPayload?.items),
);

const signalEvidenceText = (signal: CompanySignal) => pickString(
  signal.evidencePayload?.note,
  signal.evidencePayload?.summary,
  evidenceArrayText(signal.evidencePayload?.evidence),
  signal.signalType,
) ?? signal.signalType;

const signalEvidenceUrl = (signal: CompanySignal) => pickString(
  signal.evidencePayload?.sourceUrl,
  signal.evidencePayload?.canonicalUrl,
);

const sourceIdFromEnrichment = (enrichment: EnrichmentRecord) => pickString(enrichment.payload?.sourceId);
const companySourceKey = (companyId?: string | null, sourceId?: string | null) => `${companyId ?? ''}|${sourceId ?? ''}`;
const gateStatusFromResult = (result: QualityGateResult): QualityGateStatus => result.gate_result ?? (result.status as QualityGateStatus | undefined) ?? 'error';

const signalOutputIds = (signal: CompanySignal) => {
  const exact = pickString(signal.evidencePayload?.outputId);
  const many = stringArray(signal.evidencePayload?.outputIds);
  return [...new Set([...(exact ? [exact] : []), ...many])];
};

const enrichmentOutputIds = (enrichment: EnrichmentRecord) => {
  const direct = stringArray(enrichment.payload?.outputIds);
  const nested = Array.isArray(enrichment.payload?.outputs)
    ? enrichment.payload.outputs.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const outputId = pickString((item as Record<string, unknown>).outputId);
        return outputId ? [outputId] : [];
      })
    : [];
  return [...new Set([...direct, ...nested])];
};

export type CapturePersistenceSummary = {
  status: RuntimeStatus;
  companiesProcessed: number;
  runsWritten: number;
  outputsWritten: number;
  signalsWritten: number;
  enrichmentsWritten: number;
  documentsWritten: number;
  qualityGatesRun: number;
  documentsAllowed: number;
  documentsInReview: number;
  documentsQuarantined: number;
  treatmentRunsWritten: number;
  treatmentResultsWritten: number;
  learningEventsWritten: number;
  decisionGate: TreatmentDecisionGate;
  errors: string[];
};

const emptyDecisionGate = (): TreatmentDecisionGate => ({
  eligibleOutputIds: [],
  blockedOutputIds: [],
  outputQualityStatus: {},
  outputBlockReason: {},
  allowedCompanySourcePairs: [],
  blockedCompanySourcePairs: [],
});

export class CapturePersistenceService {
  private readonly client = getSupabaseClient();

  async persist(results: CaptureEngineResult[], reason: string): Promise<CapturePersistenceSummary> {
    if (!this.client) {
      return {
        status: 'partial',
        companiesProcessed: results.length,
        runsWritten: 0,
        outputsWritten: 0,
        signalsWritten: 0,
        enrichmentsWritten: 0,
        documentsWritten: 0,
        qualityGatesRun: 0,
        documentsAllowed: 0,
        documentsInReview: 0,
        documentsQuarantined: 0,
        treatmentRunsWritten: 0,
        treatmentResultsWritten: 0,
        learningEventsWritten: 0,
        decisionGate: emptyDecisionGate(),
        errors: ['Supabase client not configured.'],
      };
    }

    const now = new Date().toISOString();
    const runRows = results.map((result) => ({
      id: crypto.randomUUID(),
      company_id: result.run.companyId ?? null,
      source_id: result.run.sourceId ?? null,
      scope_type: result.run.scopeType,
      trigger_type: result.run.triggerType,
      status: result.run.status,
      started_at: now,
      finished_at: now,
      items_collected: result.run.itemsCollected,
      outputs_written: result.outputs.length,
      signals_written: result.signals.length,
      enrichments_written: result.enrichments.length,
      metadata: result.run.diagnostics ?? {},
    }));

    const runIdByCompany = new Map<string, string>();
    results.forEach((result, index) => {
      const runRow = runRows[index];
      if (result.run.companyId && runRow) runIdByCompany.set(result.run.companyId, runRow.id);
    });

    const allOutputs = results.flatMap((result) => result.outputs);
    const outputRows = allOutputs.map((output) => ({
      id: output.id,
      company_id: output.companyId,
      source_id: output.sourceId,
      output_type: 'raw',
      title: output.title,
      url: sourceUrlFromOutput(output) ?? null,
      raw_text: output.summary,
      summary: output.summary,
      observed_at: output.collectedAt,
      processed_at: now,
      status: output.connectorStatus === 'real' ? 'processed' : 'partial',
      source_confidence: asPercent(output.confidenceScore),
      payload: {
        ...output.normalizedPayload,
        connectorStatus: output.connectorStatus,
        confidenceScore: output.confidenceScore,
      },
      normalized_payload: output.normalizedPayload,
      confidence_score: output.confidenceScore,
      connector_status: output.connectorStatus,
      observed_vs_inferred: 'observed',
    }));

    const outputIdByCompanyAndSource = new Map<string, string>();
    allOutputs.forEach((output) => {
      outputIdByCompanyAndSource.set(companySourceKey(output.companyId, output.sourceId), output.id);
    });

    const allDocuments = results.flatMap((result) => result.documents);
    const documentRows = allDocuments.map((doc: CanonicalSourceDocument) => ({
      id: doc.id,
      run_id: doc.companyId ? runIdByCompany.get(doc.companyId) ?? null : null,
      company_id: doc.companyId,
      source_id: doc.sourceId,
      document_type: doc.documentType,
      external_id: doc.externalId ?? null,
      canonical_url: doc.canonicalUrl || null,
      title: doc.title,
      published_at: doc.publishedAt ?? null,
      observed_at: doc.observedAt,
      captured_at: doc.observedAt,
      content_hash: doc.contentHash,
      payload_hash: doc.contentHash,
      evidence_url: doc.canonicalUrl || null,
      raw_payload: doc.rawPayload,
      normalized_payload: doc.normalizedPayload,
      extraction_status: doc.extractionStatus,
      confidence_score: doc.confidenceScore ?? null,
      confidence: doc.confidenceScore ?? null,
      quality_status: 'pending',
    }));

    const documentById = new Map(allDocuments.map((doc) => [doc.id, doc]));
    const treatmentByOutputId = new Map<string, TreatmentResultRecord>();
    results.flatMap((result) => result.treatmentResults).forEach((treatment) => treatmentByOutputId.set(treatment.outputId, treatment));

    const errors: string[] = [];
    let runsWritten = 0;
    let outputsWritten = 0;
    let signalsWritten = 0;
    let enrichmentsWritten = 0;
    let documentsWritten = 0;
    let qualityGatesRun = 0;
    let documentsAllowed = 0;
    let documentsInReview = 0;
    let documentsQuarantined = 0;
    let treatmentRunsWritten = 0;
    let treatmentResultsWritten = 0;
    let learningEventsWritten = 0;

    try {
      if (runRows.length) {
        await this.client.insert('source_connector_runs', runRows);
        runsWritten = runRows.length;
      }
    } catch (error) {
      errors.push(`source_connector_runs: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (outputRows.length) {
        await this.client.upsert('monitoring_outputs', outputRows, 'id');
        outputsWritten = outputRows.length;
      }
    } catch (error) {
      errors.push(`monitoring_outputs: ${error instanceof Error ? error.message : String(error)}`);
    }

    const allowedCompanySourcePairs = new Set<string>();
    const blockedCompanySourcePairs = new Set<string>();
    const eligibleOutputIds = new Set<string>();
    const blockedOutputIds = new Set<string>();
    const outputQualityStatus: Record<string, string> = {};
    const outputBlockReason: Record<string, string> = {};
    const qualityResults: QualityGateResult[] = [];

    try {
      if (documentRows.length) {
        await this.client.upsert('source_documents', documentRows, 'id');
        documentsWritten = documentRows.length;

        for (const doc of documentRows) {
          const sourceDocument = documentById.get(doc.id);
          const outputId = sourceDocument?.monitoringOutputId;
          const treatment = outputId ? treatmentByOutputId.get(outputId) : undefined;
          const key = companySourceKey(sourceDocument?.companyId, sourceDocument?.sourceId);

          try {
            const qualityResult = await this.client.rpc<QualityGateResult>('run_source_document_quality_gate', {
              p_source_document_id: doc.id,
            });
            qualityResults.push(qualityResult);
            qualityGatesRun += 1;

            const gateStatus = gateStatusFromResult(qualityResult);
            const qualityAllowed = ALLOWED_DOCUMENT_STATUSES.has(gateStatus);
            const intrinsicAllowed = treatment?.intrinsicDecisionEligible ?? false;
            const decisionEligible = Boolean(outputId && intrinsicAllowed && qualityAllowed);

            if (outputId) outputQualityStatus[outputId] = gateStatus;

            if (gateStatus === 'allow') documentsAllowed += 1;
            else if (gateStatus === 'review') documentsInReview += 1;
            else if (gateStatus === 'quarantine') documentsQuarantined += 1;

            if (decisionEligible && outputId) {
              eligibleOutputIds.add(outputId);
              allowedCompanySourcePairs.add(key);
            } else {
              if (outputId) {
                blockedOutputIds.add(outputId);
                outputBlockReason[outputId] = !intrinsicAllowed
                  ? `intrinsic_treatment_gate:${treatment?.qualityIssues.join(',') || 'low_relevance_or_quality'}`
                  : `source_document_gate:${gateStatus}${qualityResult.quarantine_reason ? `:${qualityResult.quarantine_reason}` : ''}`;
              }
              blockedCompanySourcePairs.add(key);
            }
          } catch (error) {
            if (outputId) {
              outputQualityStatus[outputId] = 'error';
              blockedOutputIds.add(outputId);
              outputBlockReason[outputId] = 'source_document_gate:error';
            }
            blockedCompanySourcePairs.add(key);
            errors.push(`quality_gate:${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      errors.push(`source_documents: ${error instanceof Error ? error.message : String(error)}`);
      allOutputs.forEach((output) => {
        blockedOutputIds.add(output.id);
        outputQualityStatus[output.id] = 'error';
        outputBlockReason[output.id] = 'source_documents:persistence_error';
        blockedCompanySourcePairs.add(companySourceKey(output.companyId, output.sourceId));
      });
    }

    allOutputs.forEach((output) => {
      if (eligibleOutputIds.has(output.id) || blockedOutputIds.has(output.id)) return;
      blockedOutputIds.add(output.id);
      outputQualityStatus[output.id] = 'not_found';
      outputBlockReason[output.id] = 'source_document_gate:not_found';
      blockedCompanySourcePairs.add(companySourceKey(output.companyId, output.sourceId));
    });

    const decisionGate: TreatmentDecisionGate = {
      eligibleOutputIds: [...eligibleOutputIds],
      blockedOutputIds: [...blockedOutputIds],
      outputQualityStatus,
      outputBlockReason,
      allowedCompanySourcePairs: [...allowedCompanySourcePairs],
      blockedCompanySourcePairs: [...blockedCompanySourcePairs],
    };

    const isAllowedByDecisionGate = (
      companyId: string,
      sourceId: string | undefined,
      referencedOutputIds: string[],
    ) => {
      if (referencedOutputIds.length) return referencedOutputIds.every((outputId) => eligibleOutputIds.has(outputId));
      if (sourceId) {
        const key = companySourceKey(companyId, sourceId);
        return allowedCompanySourcePairs.has(key) && !blockedCompanySourcePairs.has(key);
      }
      const companyOutputIds = allOutputs.filter((output) => output.companyId === companyId).map((output) => output.id);
      return companyOutputIds.length > 0 && companyOutputIds.every((outputId) => eligibleOutputIds.has(outputId));
    };

    const allSignals = results.flatMap((result) => result.signals);
    const signalRows = allSignals
      .filter((signal) => isAllowedByDecisionGate(signal.companyId, signal.sourceId, signalOutputIds(signal)))
      .map((signal) => {
        const referencedOutputId = signalOutputIds(signal)[0];
        return {
          id: signal.id,
          company_id: signal.companyId,
          source_id: signal.sourceId ?? null,
          monitoring_output_id: referencedOutputId
            ?? (signal.sourceId ? outputIdByCompanyAndSource.get(companySourceKey(signal.companyId, signal.sourceId)) ?? null : null),
          signal_type: signal.signalType,
          signal_label: String(signal.evidencePayload?.label ?? signal.signalType).replace(/_/g, ' '),
          strength: asPercent(signal.signalStrength),
          confidence: asPercent(signal.confidenceScore),
          is_explicit: signal.observedVsInferred === 'observed',
          evidence_url: signalEvidenceUrl(signal) ?? null,
          evidence_text: signalEvidenceText(signal),
          observed_at: signal.createdAt,
          metadata: {
            ...signal.evidencePayload,
            source_id: signal.sourceId,
            observedVsInferred: signal.observedVsInferred,
          },
        };
      });

    const allEnrichments = results.flatMap((result) => result.enrichments);
    const enrichmentRows = allEnrichments
      .filter((enrichment) => isAllowedByDecisionGate(
        enrichment.companyId,
        sourceIdFromEnrichment(enrichment),
        enrichmentOutputIds(enrichment),
      ))
      .map((enrichment) => ({
        id: enrichment.id,
        company_id: enrichment.companyId,
        enrichment_type: enrichment.enrichmentType,
        provider: enrichment.provider ?? null,
        payload: {
          ...enrichment.payload,
          source_id: sourceIdFromEnrichment(enrichment) ?? null,
          observedVsInferred: enrichment.observedVsInferred,
        },
        observed_vs_inferred: enrichment.observedVsInferred,
        created_at: enrichment.createdAt,
      }));

    try {
      if (signalRows.length) {
        await this.client.upsert('company_signals', signalRows, 'id');
        signalsWritten = signalRows.length;
      }
    } catch (error) {
      errors.push(`company_signals: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (enrichmentRows.length) {
        await this.client.upsert('enrichments', enrichmentRows, 'id');
        enrichmentsWritten = enrichmentRows.length;
      }
    } catch (error) {
      errors.push(`enrichments: ${error instanceof Error ? error.message : String(error)}`);
    }

    const treatmentRunIdByCompany = new Map<string, string>();
    const treatmentRunRows = results.map((result) => {
      const runId = crypto.randomUUID();
      if (result.run.companyId) treatmentRunIdByCompany.set(result.run.companyId, runId);
      const treatments = result.treatmentResults;
      return {
        id: runId,
        company_id: result.run.companyId ?? null,
        source_id: result.run.sourceId ?? null,
        treatment_version: treatments[0]?.treatmentVersion ?? result.run.diagnostics?.treatment?.treatmentVersion ?? 'capture_treatment_v2',
        trigger_type: result.run.triggerType,
        scope_type: result.run.scopeType,
        status: result.run.status,
        outputs_seen: treatments.length,
        outputs_relevant: treatments.filter((item) => item.relevanceScore >= 55).length,
        outputs_decision_eligible: treatments.filter((item) => eligibleOutputIds.has(item.outputId)).length,
        signals_generated: result.signals.length,
        enrichments_generated: result.enrichments.length,
        average_relevance_score: treatments.length ? treatments.reduce((sum, item) => sum + item.relevanceScore, 0) / treatments.length : 0,
        average_quality_score: treatments.length ? treatments.reduce((sum, item) => sum + item.qualityScore, 0) / treatments.length : 0,
        started_at: now,
        finished_at: now,
        metadata: { reason, diagnostics: result.run.diagnostics ?? {} },
      };
    });

    const treatmentResultRows = results.flatMap((result) => {
      const treatmentRunId = result.run.companyId ? treatmentRunIdByCompany.get(result.run.companyId) : undefined;
      if (!treatmentRunId) return [];
      return result.treatmentResults.map((treatment) => ({
        id: crypto.randomUUID(),
        treatment_run_id: treatmentRunId,
        monitoring_output_id: treatment.outputId,
        company_id: treatment.companyId,
        source_id: treatment.sourceId,
        treatment_version: treatment.treatmentVersion,
        content_fingerprint: treatment.contentFingerprint,
        relevance_score: treatment.relevanceScore,
        quality_score: treatment.qualityScore,
        confidence_score: treatment.confidenceScore,
        evidence_level: treatment.evidenceLevel,
        signal_families: treatment.signalFamilies,
        suggested_structures: treatment.suggestedStructures,
        normalized_facts: treatment.normalizedFacts,
        quality_issues: treatment.qualityIssues,
        lineage: treatment.lineage,
        intrinsic_decision_eligible: treatment.intrinsicDecisionEligible,
        document_quality_status: outputQualityStatus[treatment.outputId] ?? 'not_found',
        decision_eligible: eligibleOutputIds.has(treatment.outputId),
        decision_block_reason: outputBlockReason[treatment.outputId] ?? null,
        treatment_payload: {
          detectedKeywords: treatment.detectedKeywords,
          recommendedNextAction: treatment.recommendedNextAction,
          sourceUrl: treatment.sourceUrl ?? null,
        },
        created_at: now,
        updated_at: now,
      }));
    });

    try {
      if (treatmentRunRows.length) {
        await this.client.insert('data_treatment_runs', treatmentRunRows);
        treatmentRunsWritten = treatmentRunRows.length;
      }
      if (treatmentResultRows.length) {
        await this.client.insert('data_treatment_results', treatmentResultRows);
        treatmentResultsWritten = treatmentResultRows.length;
      }
    } catch (error) {
      errors.push(`data_treatment_audit: ${error instanceof Error ? error.message : String(error)}`);
    }

    const blockedSignals = allSignals.length - signalRows.length;
    const blockedEnrichments = allEnrichments.length - enrichmentRows.length;
    const learningRows = [{
      engine_name: 'data_treatment_enrichment_engine',
      event_type: 'capture_runtime_treated_and_persisted',
      severity: errors.length ? 'warning' : 'info',
      summary: `Treatment v2 persisted ${outputRows.length} outputs; ${eligibleOutputIds.size} became decision-eligible after quality gates.`,
      payload: {
        reason,
        companiesProcessed: results.length,
        outputsWritten: outputRows.length,
        signalsWritten: signalRows.length,
        enrichmentsWritten: enrichmentRows.length,
        documentsWritten: documentRows.length,
        qualityGatesRun,
        documentsAllowed,
        documentsInReview,
        documentsQuarantined,
        decisionEligibleOutputs: eligibleOutputIds.size,
        blockedOutputs: blockedOutputIds.size,
        blockedSignals,
        blockedEnrichments,
        treatmentRunsWritten,
        treatmentResultsWritten,
        qualityResults,
      },
      created_at: now,
    }];

    try {
      await this.client.insert('engine_learning_events', learningRows);
      learningEventsWritten = learningRows.length;
    } catch (error) {
      errors.push(`engine_learning_events: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      status: errors.length ? 'partial' : 'real',
      companiesProcessed: results.length,
      runsWritten,
      outputsWritten,
      signalsWritten,
      enrichmentsWritten,
      documentsWritten,
      qualityGatesRun,
      documentsAllowed,
      documentsInReview,
      documentsQuarantined,
      treatmentRunsWritten,
      treatmentResultsWritten,
      learningEventsWritten,
      decisionGate,
      errors,
    };
  }
}
