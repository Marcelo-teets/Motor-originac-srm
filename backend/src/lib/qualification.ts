import { thesisRationales } from '../../../config/heuristics.js';
import { qualificationWeights } from '../../../config/scoring.js';
import { average, clamp, levelFromScore, maturityToScore } from './helpers.js';
import { qualificationWeightTotal } from './scoring.js';
import type { CompanySeed, QualificationSnapshot } from '../types/platform.js';

const receivablesRecurrence = (receivables: string[]) => (receivables.length >= 2 ? 'high' : 'medium');
const receivablesPredictability = (receivables: string[]) => (receivables.some((item) => ['Cartão', 'Folha', 'Mensalidades', 'Assinaturas'].includes(item)) ? 'medium_high' : 'medium');

export const buildQualificationSnapshot = (company: CompanySeed, generatedAt: string): QualificationSnapshot => {
  const structuralScore = clamp(
    (company.creditProduct ? 55 : 0) +
      (company.receivables.length >= 2 ? 25 : 15) +
      (company.currentFundingStructure.includes('Balanço próprio') ? 10 : 18),
  );
  const capitalScore = clamp(company.currentFundingStructure.includes('FIDC') ? 55 : 82);
  const receivablesScore = clamp((company.receivables.length >= 2 ? 72 : 58) + (company.receivables.includes('Cartão') ? 12 : 0));
  const executionScore = clamp(
    average([
      maturityToScore(company.enrichment.governanceMaturity),
      maturityToScore(company.enrichment.underwritingMaturity),
      maturityToScore(company.enrichment.operationalMaturity),
      maturityToScore(company.enrichment.riskModelMaturity),
    ]),
  );
  const timingScore = clamp(average(company.signals.map((signal) => signal.strength)));

  const weightedTotal = clamp(
    (structuralScore * qualificationWeights.structural +
      capitalScore * qualificationWeights.capitalStructure +
      receivablesScore * qualificationWeights.receivables +
      executionScore * qualificationWeights.execution +
      timingScore * qualificationWeights.timing) /
      qualificationWeightTotal,
  );

  const fitFidc = company.receivables.length >= 2 && !company.currentFundingStructure.includes('FIDC');
  const fitDcm = ['Debênture privada piloto', 'Balanço próprio', 'linhas bilaterais'].some((fragment) => company.currentFundingStructure.includes(fragment));
  const suggestedStructure = fitFidc ? 'FIDC + warehouse inicial' : fitDcm ? 'Debênture / nota comercial privada' : 'Warehouse';
  const predictedFundingNeed = clamp((capitalScore * 0.45) + (timingScore * 0.35) + (weightedTotal * 0.2));
  const urgency = clamp((timingScore * 0.5) + (capitalScore * 0.3) + (structuralScore * 0.2));
  const rationale = fitFidc ? thesisRationales.fidc : fitDcm ? thesisRationales.note : thesisRationales.dcm;

  return {
    companyId: company.id,
    has_credit_product: true,
    credit_product_type: company.creditProduct,
    credit_is_core_product: true,
    has_receivables: company.receivables.length > 0,
    receivables_type: company.receivables,
    receivables_recurrence_level: receivablesRecurrence(company.receivables),
    receivables_predictability_level: receivablesPredictability(company.receivables),
    has_fidc: company.currentFundingStructure.includes('FIDC'),
    has_securitization_structure: company.currentFundingStructure.includes('FIDC') || company.currentFundingStructure.includes('securit'),
    has_existing_debt_structure: !company.currentFundingStructure.includes('Balanço próprio'),
    funding_structure_type: company.currentFundingStructure,
    capital_structure_quality: company.currentFundingStructure.includes('Balanço próprio') ? 'partial' : 'emerging',
    capital_structure_rationale: `Estrutura atual: ${company.currentFundingStructure}. ${rationale}`,
    funding_gap_level: capitalScore >= 75 ? 'high' : 'medium',
    capital_dependency_level: company.currentFundingStructure.includes('Balanço próprio') ? 'high' : 'medium',
    growth_vs_funding_mismatch: urgency >= 75 ? 'elevated' : 'moderate',
    fit_fidc: fitFidc,
    fit_dcm: fitDcm,
    fit_other_structure: suggestedStructure,
    governance_maturity_level: company.enrichment.governanceMaturity,
    risk_model_maturity_level: company.enrichment.riskModelMaturity,
    underwriting_maturity_level: company.enrichment.underwritingMaturity,
    operational_maturity_level: company.enrichment.operationalMaturity,
    unit_economics_quality: company.enrichment.unitEconomicsQuality,
    spread_vs_funding_quality: company.enrichment.spreadVsFundingQuality,
    concentration_risk_level: company.enrichment.concentrationRisk,
    delinquency_signal_level: company.enrichment.delinquencySignal,
    timing_intensity_level: levelFromScore(timingScore),
    execution_readiness_level: levelFromScore(executionScore),
    qualification_score_structural: structuralScore,
    qualification_score_capital: capitalScore,
    qualification_score_receivables: receivablesScore,
    qualification_score_execution: executionScore,
    qualification_score_timing: timingScore,
    qualification_score_total: weightedTotal,
    confidence_score: Number(company.enrichment.sourceConfidence.toFixed(2)),
    rationale_summary: `${company.tradeName}: ${rationale}`,
    evidence_payload: {
      signals: company.signals,
      monitoring: company.monitoring,
      enrichment: company.enrichment,
    },
    predicted_funding_need_score: predictedFundingNeed,
    urgency_score: urgency,
    suggested_structure_type: suggestedStructure,
    source_confidence_score: Number(company.enrichment.sourceConfidence.toFixed(2)),
    trigger_strength_score: timingScore,
    pattern_summary: [],
    created_at: generatedAt,
  };
};
