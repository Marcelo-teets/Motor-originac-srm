import { getSupabaseClient } from '../lib/supabase.js';
import { buildQualificationSnapshot } from '../lib/qualification.js';
import { detectCompanyPatterns } from '../lib/patterns.js';
import { computeLeadScore } from '../lib/scoring.js';
import { CAPTURE_TREATMENT_VERSION } from '../modules/data-capture/captureTreatment.js';
import type { CaptureEngineResult } from '../modules/data-capture/types.js';
import type { CompanySeed, CompanySignal, MonitoringOutput, PatternCatalogEntry, PriorityBucket } from '../types/platform.js';

export type CaptureDerivedSyncInput = {
  companies: CompanySeed[];
  patternCatalog: PatternCatalogEntry[];
  captureResults: CaptureEngineResult[];
  reason: string;
};

export type CaptureDerivedSyncSummary = {
  status: 'real' | 'partial';
  qualificationsWritten: number;
  patternsWritten: number;
  scoreSnapshotsWritten: number;
  leadScoreSnapshotsWritten: number;
  pipelineRowsTouched: number;
  errors: string[];
};

const asPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

const treatmentFromOutput = (output: MonitoringOutput) => {
  const treatment = output.normalizedPayload?.treatment;
  return treatment && typeof treatment === 'object' ? treatment as Record<string, unknown> : undefined;
};

const treatmentAction = (outputs: MonitoringOutput[]) => {
  for (const output of outputs) {
    const action = treatmentFromOutput(output)?.recommendedNextAction;
    if (typeof action === 'string' && action.trim()) return action.trim();
  }
  return undefined;
};

const suggestedStructureFromTreatment = (outputs: MonitoringOutput[]) => {
  for (const output of outputs) {
    const structures = treatmentFromOutput(output)?.suggestedStructures;
    if (Array.isArray(structures) && structures.length) return String(structures[0]);
  }
  return undefined;
};

const treatmentDrivers = (outputs: MonitoringOutput[]) => outputs
  .map((output) => {
    const treatment = treatmentFromOutput(output);
    if (!treatment) return null;
    return {
      outputId: output.id,
      title: output.title,
      relevanceScore: treatment.relevanceScore,
      signalFamilies: treatment.signalFamilies,
      suggestedStructures: treatment.suggestedStructures,
      recommendedNextAction: treatment.recommendedNextAction,
    };
  })
  .filter(Boolean);

const signalToSeedShape = (signal: CompanySignal) => ({
  type: signal.signalType,
  strength: signal.signalStrength,
  confidence: signal.confidenceScore,
  note: String(signal.evidencePayload?.note ?? signal.evidencePayload?.summary ?? signal.signalType),
  source: signal.sourceId ?? String(signal.evidencePayload?.sourceId ?? 'capture_treatment'),
});

const normalizeCompanyWithCapture = (company: CompanySeed, result: CaptureEngineResult): CompanySeed => ({
  ...company,
  signals: [
    ...result.signals.map(signalToSeedShape),
    ...company.signals,
  ],
  monitoring: {
    ...company.monitoring,
    status: result.run.status === 'failed' ? company.monitoring.status : 'active',
    lastRunAt: result.outputs[0]?.collectedAt ?? company.monitoring.lastRunAt,
    outputs24h: result.outputs.length,
    triggers24h: result.signals.filter((signal) => signal.signalStrength >= 65).length,
    websiteChanges: result.outputs.filter((output) => String(output.normalizedPayload?.sourceCode ?? '').includes('website')).slice(0, 2).map((output) => output.summary),
    feedHighlights: result.outputs.filter((output) => !String(output.normalizedPayload?.sourceCode ?? '').includes('website')).slice(0, 3).map((output) => output.summary),
  },
});

const qualificationRow = (qualification: ReturnType<typeof buildQualificationSnapshot>, nextAction: string, drivers: unknown[]) => ({
  company_id: qualification.companyId,
  snapshot_version: CAPTURE_TREATMENT_VERSION,
  has_credit_product: qualification.has_credit_product,
  credit_is_core: qualification.credit_is_core_product,
  has_receivables: qualification.has_receivables,
  receivables_structurable: qualification.fit_fidc || qualification.has_receivables,
  has_fidc: qualification.has_fidc,
  uses_structured_debt: qualification.has_existing_debt_structure,
  capital_structure_fit: qualification.capital_structure_quality,
  funding_gap: qualification.funding_gap_level !== 'low',
  fit_fidc: qualification.fit_fidc,
  fit_dcm: qualification.fit_dcm,
  timing: qualification.timing_intensity_level,
  structural_need_score: qualification.qualification_score_structural,
  timing_score: qualification.qualification_score_timing,
  executability_score: qualification.qualification_score_execution,
  total_score: qualification.qualification_score_total,
  rationale: qualification.rationale_summary,
  next_action: nextAction,
  evidence: drivers,
  created_by: 'capture_derived_sync',
  credit_product_type: qualification.credit_product_type,
  credit_is_core_product: qualification.credit_is_core_product,
  receivables_type: qualification.receivables_type,
  receivables_recurrence_level: qualification.receivables_recurrence_level,
  receivables_predictability_level: qualification.receivables_predictability_level,
  has_securitization_structure: qualification.has_securitization_structure,
  has_existing_debt_structure: qualification.has_existing_debt_structure,
  funding_structure_type: qualification.funding_structure_type,
  capital_structure_quality: qualification.capital_structure_quality,
  capital_structure_rationale: qualification.capital_structure_rationale,
  funding_gap_level: qualification.funding_gap_level,
  capital_dependency_level: qualification.capital_dependency_level,
  growth_vs_funding_mismatch: qualification.growth_vs_funding_mismatch,
  fit_other_structure: qualification.fit_other_structure,
  governance_maturity_level: qualification.governance_maturity_level,
  risk_model_maturity_level: qualification.risk_model_maturity_level,
  underwriting_maturity_level: qualification.underwriting_maturity_level,
  operational_maturity_level: qualification.operational_maturity_level,
  unit_economics_quality: qualification.unit_economics_quality,
  spread_vs_funding_quality: qualification.spread_vs_funding_quality,
  concentration_risk_level: qualification.concentration_risk_level,
  delinquency_signal_level: qualification.delinquency_signal_level,
  timing_intensity_level: qualification.timing_intensity_level,
  execution_readiness_level: qualification.execution_readiness_level,
  qualification_score_structural: qualification.qualification_score_structural,
  qualification_score_capital: qualification.qualification_score_capital,
  qualification_score_receivables: qualification.qualification_score_receivables,
  qualification_score_execution: qualification.qualification_score_execution,
  qualification_score_timing: qualification.qualification_score_timing,
  confidence_score: qualification.confidence_score,
  rationale_summary: qualification.rationale_summary,
  evidence_payload: qualification.evidence_payload,
  predicted_funding_need_score: qualification.predicted_funding_need_score,
  source_confidence_score: qualification.source_confidence_score,
  trigger_strength_score: qualification.trigger_strength_score,
  suggested_structure_type: qualification.suggested_structure_type,
  pattern_summary: qualification.pattern_summary,
  created_at: qualification.created_at,
});

export class CaptureDerivedSyncService {
  private readonly client = getSupabaseClient();

  async sync(input: CaptureDerivedSyncInput): Promise<CaptureDerivedSyncSummary> {
    if (!this.client) {
      return {
        status: 'partial',
        qualificationsWritten: 0,
        patternsWritten: 0,
        scoreSnapshotsWritten: 0,
        leadScoreSnapshotsWritten: 0,
        pipelineRowsTouched: 0,
        errors: ['Supabase client not configured.'],
      };
    }

    const errors: string[] = [];
    const generatedAt = new Date().toISOString();
    const resultByCompany = new Map(input.captureResults.map((result) => [result.run.companyId, result]));
    const derived = input.companies
      .map((company) => {
        const result = resultByCompany.get(company.id);
        if (!result) return null;
        const outputs = result.outputs;
        const enrichedCompany = normalizeCompanyWithCapture(company, result);
        const qualification = buildQualificationSnapshot({ company: enrichedCompany, monitoringOutputs: outputs, generatedAt });
        const nextAction = treatmentAction(outputs) ?? company.activities[0]?.title ?? 'Validar tese comercial a partir da captura tratada.';
        const structure = suggestedStructureFromTreatment(outputs) ?? qualification.suggested_structure_type;
        const drivers = treatmentDrivers(outputs);
        return { company: enrichedCompany, result, outputs, qualification: { ...qualification, suggested_structure_type: structure }, nextAction, drivers };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const qualificationRows = derived.map((item) => qualificationRow(item.qualification, item.nextAction, item.drivers));

    let qualificationsWritten = 0;
    let patternsWritten = 0;
    let scoreSnapshotsWritten = 0;
    let leadScoreSnapshotsWritten = 0;
    let pipelineRowsTouched = 0;

    try {
      if (qualificationRows.length) {
        await this.client.insert('qualification_snapshots', qualificationRows);
        qualificationsWritten = qualificationRows.length;
      }
    } catch (error) {
      errors.push(`qualification_snapshots: ${error instanceof Error ? error.message : String(error)}`);
    }

    const patternRows = derived.flatMap((item) => {
      const patterns = detectCompanyPatterns(item.company, item.qualification, input.patternCatalog, item.outputs);
      return patterns.map((pattern) => ({
        id: crypto.randomUUID(),
        company_id: pattern.companyId,
        pattern_id: pattern.patternId,
        confidence: asPercent(pattern.confidenceScore),
        rationale: pattern.rationale,
        supporting_signal_ids: [],
        confidence_score: pattern.confidenceScore,
        qualification_impact: pattern.qualificationImpact,
        lead_score_impact: pattern.leadScoreImpact,
        ranking_impact: pattern.rankingImpact,
        thesis_impact: pattern.thesisImpact,
        evidence_payload: pattern.evidencePayload,
        detected_at: generatedAt,
        created_at: generatedAt,
      }));
    });

    try {
      if (patternRows.length) {
        await this.client.upsert('company_patterns', patternRows, 'id');
        patternsWritten = patternRows.length;
      }
    } catch (error) {
      errors.push(`company_patterns: ${error instanceof Error ? error.message : String(error)}`);
    }

    const scoreRows = derived.flatMap((item) => {
      const q = item.qualification;
      return [
        { scoreType: 'qualification', value: q.qualification_score_total, rationale: q.rationale_summary },
        { scoreType: 'funding_need', value: q.predicted_funding_need_score, rationale: 'Funding need derivado da captura tratada e sinais recentes.' },
        { scoreType: 'urgency', value: q.urgency_score, rationale: 'Urgência derivada dos sinais tratados e timing capturado.' },
      ].map((score) => ({
        company_id: q.companyId,
        score_version: CAPTURE_TREATMENT_VERSION,
        structural_need_score: q.qualification_score_structural,
        timing_score: q.qualification_score_timing,
        executability_score: q.qualification_score_execution,
        source_confidence_score: clamp(q.source_confidence_score * 100),
        trigger_strength_score: q.trigger_strength_score,
        total_score: score.value,
        rationale: score.rationale,
        drivers: item.drivers,
        score_type: score.scoreType,
        score_value: score.value,
        version: 3,
        created_at: generatedAt,
      }));
    });

    try {
      if (scoreRows.length) {
        await this.client.insert('score_snapshots', scoreRows);
        scoreSnapshotsWritten = scoreRows.length;
      }
    } catch (error) {
      errors.push(`score_snapshots: ${error instanceof Error ? error.message : String(error)}`);
    }

    const leadRows = derived.map((item) => {
      const patternScore = patternRows.filter((pattern) => pattern.company_id === item.company.id).reduce((sum, pattern) => sum + Number(pattern.lead_score_impact ?? 0), 0);
      const lead = computeLeadScore({
        qualificationScore: item.qualification.qualification_score_total,
        sourceConfidence: item.qualification.source_confidence_score,
        triggerStrength: item.qualification.trigger_strength_score,
        timingIntensity: item.qualification.urgency_score,
        executionReadiness: item.qualification.qualification_score_execution,
        dataQuality: item.qualification.confidence_score * 100,
        pipelineReadiness: item.qualification.predicted_funding_need_score,
        patternScore,
      });

      return {
        company_id: item.company.id,
        lead_score: lead.score,
        priority_tier: lead.bucket as PriorityBucket,
        commercial_angle: 'Originação acionada por captura tratada.',
        suggested_structure: item.qualification.suggested_structure_type,
        next_action: item.nextAction,
        rationale: `Lead score recalculado após captura tratada. Pattern score: ${patternScore}.`,
        source_confidence: item.qualification.source_confidence_score,
        trigger_strength: item.qualification.trigger_strength_score,
        pattern_score: patternScore,
        created_at: generatedAt,
      };
    });

    try {
      if (leadRows.length) {
        await this.client.insert('lead_score_snapshots', leadRows);
        leadScoreSnapshotsWritten = leadRows.length;
      }
    } catch (error) {
      errors.push(`lead_score_snapshots: ${error instanceof Error ? error.message : String(error)}`);
    }

    const pipelineRows = leadRows.map((lead) => ({
      company_id: lead.company_id,
      stage: 'Qualified',
      status: 'active',
      priority: lead.priority_tier,
      next_action: lead.next_action,
      expected_structure: lead.suggested_structure,
      notes: `Atualizado por capture_derived_sync. Motivo: ${input.reason}.`,
      updated_at: generatedAt,
    }));

    try {
      if (pipelineRows.length) {
        await this.client.upsert('pipeline', pipelineRows, 'company_id');
        pipelineRowsTouched = pipelineRows.length;
      }
    } catch (error) {
      errors.push(`pipeline: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      status: errors.length ? 'partial' : 'real',
      qualificationsWritten,
      patternsWritten,
      scoreSnapshotsWritten,
      leadScoreSnapshotsWritten,
      pipelineRowsTouched,
      errors,
    };
  }
}
