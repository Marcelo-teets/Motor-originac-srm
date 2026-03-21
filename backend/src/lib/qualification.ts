import { thesisRationales } from '../../../config/heuristics.js';
import { qualificationWeights } from '../../../config/scoring.js';
import { average, clamp, levelFromScore, maturityToScore } from './helpers.js';
import { qualificationWeightTotal } from './scoring.js';
import type { CompanySeed, MonitoringOutput, QualificationSnapshot } from '../types/platform.js';

const receivablesRecurrence = (receivables: string[]) => (receivables.length >= 2 ? 'high' : 'medium');
const receivablesPredictability = (receivables: string[]) => (receivables.some((item) => ['Cartão', 'Folha', 'Mensalidades', 'Assinaturas', 'Boletos', 'Pix parcelado'].includes(item)) ? 'medium_high' : 'medium');

const scoreFromMonitoring = (outputs: MonitoringOutput[]) => {
  if (!outputs.length) return 45;
  const avgConfidence = average(outputs.map((output) => output.confidenceScore * 100));
  const realCoverage = outputs.filter((output) => output.connectorStatus === 'real').length * 8;
  return clamp(avgConfidence * 0.65 + realCoverage);
};

const scoreFromSignals = (company: CompanySeed) => {
  if (!company.signals.length) return 40;
  return clamp(average(company.signals.map((signal) => signal.strength)));
};

export const buildQualificationSnapshot = ({
  company,
  monitoringOutputs,
  generatedAt,
}: {
  company: CompanySeed;
  monitoringOutputs: MonitoringOutput[];
  generatedAt: string;
}): QualificationSnapshot => {
  const monitoringScore = scoreFromMonitoring(monitoringOutputs);
  const timingScore = scoreFromSignals(company);

  const structuralScore = clamp(
    (company.creditProduct ? 52 : 0) +
      (company.receivables.length >= 2 ? 24 : 15) +
      (monitoringScore >= 65 ? 12 : 5) +
      (company.currentFundingStructure.includes('Balanço próprio') ? 12 : 20),
  );
  const capitalScore = clamp(
    (company.currentFundingStructure.includes('FIDC') ? 48 : 72) +
      (timingScore >= 75 ? 14 : 8) +
      (company.enrichment.spreadVsFundingQuality === 'fragile' ? 10 : 4),
  );
  const receivablesScore = clamp(
    (company.receivables.length >= 2 ? 70 : 56) +
      (company.receivables.some((item) => ['Cartão', 'Folha', 'Mensalidades', 'Assinaturas'].includes(item)) ? 12 : 5) +
      (monitoringOutputs.some((item) => /receb|cart|assinatura|folha/i.test(item.summary)) ? 10 : 0),
  );
  const executionScore = clamp(
    average([
      maturityToScore(company.enrichment.governanceMaturity),
      maturityToScore(company.enrichment.underwritingMaturity),
      maturityToScore(company.enrichment.operationalMaturity),
      maturityToScore(company.enrichment.riskModelMaturity),
      monitoringScore,
    ]),
  );

  const weightedTotal = clamp(
    (structuralScore * qualificationWeights.structural +
      capitalScore * qualificationWeights.capitalStructure +
      receivablesScore * qualificationWeights.receivables +
      executionScore * qualificationWeights.execution +
      timingScore * qualificationWeights.timing) /
      qualificationWeightTotal,
  );

  const fitFidc = company.receivables.length >= 2 && !company.currentFundingStructure.includes('FIDC');
  const fitDcm = ['Debênture privada piloto', 'Balanço próprio', 'linhas bilaterais', 'nota comercial'].some((fragment) => company.currentFundingStructure.toLowerCase().includes(fragment.toLowerCase()));
  const suggestedStructure = fitFidc ? 'FIDC + warehouse inicial' : fitDcm ? 'Debênture / nota comercial privada' : 'Warehouse';
  const predictedFundingNeed = clamp((capitalScore * 0.4) + (timingScore * 0.3) + (weightedTotal * 0.2) + (monitoringScore * 0.1));
  const urgency = clamp((timingScore * 0.4) + (capitalScore * 0.25) + (monitoringScore * 0.2) + (structuralScore * 0.15));
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
    has_securitization_structure: company.currentFundingStructure.includes('FIDC') || company.currentFundingStructure.toLowerCase().includes('securit'),
    has_existing_debt_structure: !company.currentFundingStructure.includes('Balanço próprio'),
    funding_structure_type: company.currentFundingStructure,
    capital_structure_quality: company.currentFundingStructure.includes('Balanço próprio') ? 'partial' : 'emerging',
    capital_structure_rationale: `Estrutura atual: ${company.currentFundingStructure}. ${rationale}`,
    funding_gap_level: capitalScore >= 75 ? 'high' : capitalScore >= 60 ? 'medium' : 'low',
    capital_dependency_level: company.currentFundingStructure.includes('Balanço próprio') ? 'high' : 'medium',
    growth_vs_funding_mismatch: urgency >= 75 ? 'elevated' : urgency >= 60 ? 'moderate' : 'low',
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
    confidence_score: Number(Math.max(company.enrichment.sourceConfidence, monitoringScore / 100).toFixed(2)),
    rationale_summary: `${company.tradeName}: ${rationale}`,
    evidence_payload: {
      signals: company.signals,
      monitoringOutputs: monitoringOutputs.map((item) => ({ sourceId: item.sourceId, summary: item.summary, confidenceScore: item.confidenceScore })),
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
