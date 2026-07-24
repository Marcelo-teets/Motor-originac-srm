import { qualificationWeights } from '../../../config/scoring.js';
import type { ApprovedCompanyCreditReview, DecisionAwareCompany } from './companyDecisionEligibility.js';
import { average, clamp, levelFromScore } from './helpers.js';
import { qualificationWeightTotal } from './scoring.js';
import { computeSourceTreatmentImpact } from './sourceTreatment.js';
import type { CompanySeed, MonitoringOutput, QualificationSnapshot } from '../types/platform.js';

const monitoringSignalTerms = [
  /receb/i,
  /funding/i,
  /capital/i,
  /expans/i,
  /fidc/i,
  /warehouse/i,
  /cr[eé]dito/i,
  /deb[êe]nture/i,
  /cri/i,
];

const scoreFromMonitoring = (outputs: MonitoringOutput[]) => {
  if (!outputs.length) return 45;
  const avgConfidence = average(outputs.map((output) => output.confidenceScore * 100));
  const realCoverage = Math.min(24, outputs.filter((output) => output.connectorStatus === 'real').length * 2);
  const signalDensity = Math.min(20, outputs.filter((output) => monitoringSignalTerms.some((term) => term.test(output.summary))).length * 2);
  return clamp(avgConfidence * 0.6 + realCoverage + signalDensity);
};

const dependencyLevel = (fundingGapLevel: string | undefined) => {
  if (fundingGapLevel === 'high' || fundingGapLevel === 'medium_high') return 'high';
  if (fundingGapLevel === 'medium') return 'medium_high';
  return 'medium';
};

const mismatchLevel = (timingScore: number) => timingScore >= 80 ? 'elevated' : timingScore >= 60 ? 'moderate' : 'low';

export const buildApprovedCreditReviewQualification = ({
  company,
  monitoringOutputs,
  generatedAt,
}: {
  company: CompanySeed;
  monitoringOutputs: MonitoringOutput[];
  generatedAt: string;
}): QualificationSnapshot | null => {
  const reviewedCompany = company as DecisionAwareCompany;
  const review = reviewedCompany.creditReview;
  if (!review || review.status !== 'approved' || review.outcome !== 'eligible') return null;

  const sourceTreatmentImpact = computeSourceTreatmentImpact(company.signals);
  const monitoringScore = scoreFromMonitoring(monitoringOutputs);
  const structuralScore = clamp((review.structuralScore ?? 70) + Math.min(5, sourceTreatmentImpact.structuralScoreDelta));
  const capitalScore = clamp(review.capitalScore ?? 65);
  const receivablesScore = clamp(review.receivablesScore ?? 70);
  const executionScore = clamp((review.executionScore ?? 65) + Math.min(5, sourceTreatmentImpact.executabilityScoreDelta));
  const timingScore = clamp((review.timingScore ?? 60) + Math.min(6, sourceTreatmentImpact.timingScoreDelta));
  const weightedTotal = clamp(
    (structuralScore * qualificationWeights.structural
      + capitalScore * qualificationWeights.capitalStructure
      + receivablesScore * qualificationWeights.receivables
      + executionScore * qualificationWeights.execution
      + timingScore * qualificationWeights.timing) / qualificationWeightTotal,
  );
  const sourceConfidence = Number(Math.max(
    review.confidence ?? 0,
    company.enrichment.sourceConfidence,
    monitoringScore / 100,
    sourceTreatmentImpact.avgConfidenceScore,
  ).toFixed(2));
  const predictedFundingNeed = clamp(
    capitalScore * 0.32
      + timingScore * 0.28
      + structuralScore * 0.18
      + receivablesScore * 0.12
      + monitoringScore * 0.10,
  );
  const urgency = clamp(timingScore * 0.55 + monitoringScore * 0.20 + structuralScore * 0.15 + capitalScore * 0.10);
  const reviewRationale = review.rationale ?? `${company.tradeName}: revisão humana de crédito aprovada.`;
  const treatmentRationale = sourceTreatmentImpact.actionableSignalsCount
    ? ` Deltas controlados de sinais: estrutural ${sourceTreatmentImpact.structuralScoreDelta}, timing ${sourceTreatmentImpact.timingScoreDelta}, execução ${sourceTreatmentImpact.executabilityScoreDelta}.`
    : '';
  const receivables = review.receivablesType?.length ? review.receivablesType : company.receivables;
  const fundingStructure = review.fundingStructureType ?? company.currentFundingStructure;
  const suggestedStructure = review.suggestedStructure ?? 'Estrutura a definir em originação';

  return {
    companyId: company.id,
    has_credit_product: Boolean(review.creditProductType),
    credit_product_type: review.creditProductType ?? company.creditProduct,
    credit_is_core_product: review.creditIsCore ?? true,
    has_receivables: review.hasReceivables ?? receivables.length > 0,
    receivables_type: receivables,
    receivables_recurrence_level: review.receivablesRecurrenceLevel ?? 'medium',
    receivables_predictability_level: review.receivablesPredictabilityLevel ?? 'medium',
    has_fidc: review.hasFidc ?? /fidc/i.test(fundingStructure),
    has_securitization_structure: review.hasFidc ?? /fidc|securit|cri/i.test(fundingStructure),
    has_existing_debt_structure: review.usesStructuredDebt ?? /fidc|securit|warehouse|deb[êe]nture|nota comercial|cri|linhas bilaterais/i.test(fundingStructure),
    funding_structure_type: fundingStructure,
    capital_structure_quality: review.capitalStructureQuality ?? 'reviewed',
    capital_structure_rationale: `Estrutura revisada: ${fundingStructure}. ${reviewRationale}`,
    funding_gap_level: review.fundingGapLevel ?? 'unknown',
    capital_dependency_level: dependencyLevel(review.fundingGapLevel),
    growth_vs_funding_mismatch: mismatchLevel(timingScore),
    fit_fidc: review.fitFidc ?? false,
    fit_dcm: review.fitDcm ?? false,
    fit_other_structure: suggestedStructure,
    governance_maturity_level: company.enrichment.governanceMaturity,
    risk_model_maturity_level: company.enrichment.riskModelMaturity,
    underwriting_maturity_level: company.enrichment.underwritingMaturity,
    operational_maturity_level: company.enrichment.operationalMaturity,
    unit_economics_quality: company.enrichment.unitEconomicsQuality,
    spread_vs_funding_quality: company.enrichment.spreadVsFundingQuality,
    concentration_risk_level: company.enrichment.concentrationRisk,
    delinquency_signal_level: company.enrichment.delinquencySignal,
    timing_intensity_level: review.timingLevel ?? levelFromScore(timingScore),
    execution_readiness_level: levelFromScore(executionScore),
    qualification_score_structural: structuralScore,
    qualification_score_capital: capitalScore,
    qualification_score_receivables: receivablesScore,
    qualification_score_execution: executionScore,
    qualification_score_timing: timingScore,
    qualification_score_total: weightedTotal,
    confidence_score: sourceConfidence,
    rationale_summary: `${reviewRationale}${treatmentRationale}`,
    evidence_payload: {
      creditReview: {
        reviewId: review.reviewId,
        reviewVersion: review.reviewVersion,
        outcome: review.outcome,
        confidence: review.confidence,
        evidence: review.evidence ?? [],
        nextAction: review.nextAction,
      },
      monitoringOutputs: monitoringOutputs.map((item) => ({
        sourceId: item.sourceId,
        title: item.title,
        summary: item.summary,
        confidenceScore: item.confidenceScore,
        connectorStatus: item.connectorStatus,
      })),
      enrichment: company.enrichment,
      sourceTreatmentImpact,
      sourceOfTruth: 'approved_company_credit_review',
    },
    predicted_funding_need_score: predictedFundingNeed,
    urgency_score: urgency,
    suggested_structure_type: suggestedStructure,
    source_confidence_score: sourceConfidence,
    trigger_strength_score: timingScore,
    pattern_summary: [],
    created_at: generatedAt,
  };
};
