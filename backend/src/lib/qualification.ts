import { thesisRationales } from '../../../config/heuristics.js';
import { qualificationWeights } from '../../../config/scoring.js';
import { average, clamp, levelFromScore, maturityToScore } from './helpers.js';
import { qualificationWeightTotal } from './scoring.js';
import type { CompanySeed, MonitoringOutput, QualificationSnapshot } from '../types/platform.js';

const receivablesRecurrence = (receivables: string[]) => (receivables.length >= 2 ? 'high' : 'medium');
const receivablesPredictability = (receivables: string[]) => (receivables.some((item) => ['Cartão', 'Folha', 'Mensalidades', 'Assinaturas', 'Boletos', 'Pix parcelado', 'CPR'].includes(item)) ? 'medium_high' : 'medium');

const monitoringSignalTerms = [/receb/i, /cart/i, /funding/i, /capital/i, /expans/i, /contrat/i, /fidc/i, /warehouse/i];

const scoreFromMonitoring = (outputs: MonitoringOutput[]) => {
  if (!outputs.length) return 45;
  const avgConfidence = average(outputs.map((output) => output.confidenceScore * 100));
  const realCoverage = outputs.filter((output) => output.connectorStatus === 'real').length * 9;
  const signalDensity = outputs.filter((output) => monitoringSignalTerms.some((term) => term.test(output.summary))).length * 4;
  return clamp(avgConfidence * 0.6 + realCoverage + signalDensity);
};

const scoreFromSignals = (company: CompanySeed, outputs: MonitoringOutput[]) => {
  const base = company.signals.length ? average(company.signals.map((signal) => signal.strength)) : 40;
  const outputBoost = outputs.filter((output) => monitoringSignalTerms.some((term) => term.test(output.summary))).length * 3;
  return clamp(base + outputBoost);
};

const scoreFromFundingStructure = (currentFundingStructure: string) => {
  const value = currentFundingStructure.toLowerCase();
  if (value.includes('fidc') || value.includes('securit')) return 58;
  if (value.includes('warehouse') || value.includes('debênture') || value.includes('debenture') || value.includes('nota comercial')) return 66;
  if (value.includes('linhas bilaterais')) return 74;
  if (value.includes('balanço próprio') || value.includes('caixa')) return 85;
  return 72;
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
  const timingScore = scoreFromSignals(company, monitoringOutputs);
  const fundingStructurePenalty = scoreFromFundingStructure(company.currentFundingStructure);
  const recurringReceivablesBonus = company.receivables.length >= 2 ? 20 : 10;
  const structuredFundingPresent = /fidc|securit|warehouse|deb[êe]nture|nota comercial|linhas bilaterais/i.test(company.currentFundingStructure);
  const balanceSheetOnly = /balanço próprio|caixa/i.test(company.currentFundingStructure);
  const strongReceivables = company.receivables.some((item) => ['Cartão', 'Mensalidades', 'Assinaturas', 'Duplicatas', 'Pix parcelado', 'CPR', 'Folha'].includes(item));

  const structuralScore = clamp(
    (company.creditProduct ? 50 : 25) +
    recurringReceivablesBonus +
    (strongReceivables ? 12 : 4) +
    (monitoringScore >= 70 ? 10 : 4),
  );

  const capitalScore = clamp(
    fundingStructurePenalty +
    (timingScore >= 75 ? 10 : 4) +
    (company.enrichment.spreadVsFundingQuality === 'fragile' ? 10 : company.enrichment.spreadVsFundingQuality === 'neutral' ? 6 : 2) +
    (balanceSheetOnly ? 8 : 0),
  );

  const receivablesScore = clamp(
    (strongReceivables ? 72 : 55) +
    recurringReceivablesBonus +
    (monitoringOutputs.some((item) => /receb|cart|assinatura|folha|mensalidades|duplicatas|cpr/i.test(item.summary)) ? 8 : 0),
  );

  const executionScore = clamp(average([
    maturityToScore(company.enrichment.governanceMaturity),
    maturityToScore(company.enrichment.underwritingMaturity),
    maturityToScore(company.enrichment.operationalMaturity),
    maturityToScore(company.enrichment.riskModelMaturity),
    monitoringScore,
  ]));

  const weightedTotal = clamp(
    (structuralScore * qualificationWeights.structural +
      capitalScore * qualificationWeights.capitalStructure +
      receivablesScore * qualificationWeights.receivables +
      executionScore * qualificationWeights.execution +
      timingScore * qualificationWeights.timing) /
    qualificationWeightTotal,
  );

  const fitFidc = strongReceivables && !/fidc/i.test(company.currentFundingStructure);
  const fitDcm = ['debênture privada piloto', 'balanço próprio', 'linhas bilaterais', 'nota comercial', 'caixa'].some((fragment) => company.currentFundingStructure.toLowerCase().includes(fragment.toLowerCase()));
  const suggestedStructure = fitFidc ? 'FIDC + warehouse inicial' : fitDcm ? 'Debênture / nota comercial privada' : 'Warehouse';
  const predictedFundingNeed = clamp((capitalScore * 0.38) + (timingScore * 0.28) + (weightedTotal * 0.22) + (monitoringScore * 0.12));
  const urgency = clamp((timingScore * 0.42) + (capitalScore * 0.23) + (monitoringScore * 0.2) + (structuralScore * 0.15));
  const rationale = fitFidc ? thesisRationales.fidc : fitDcm ? thesisRationales.note : thesisRationales.dcm;

  return {
    companyId: company.id,
    has_credit_product: Boolean(company.creditProduct),
    credit_product_type: company.creditProduct,
    credit_is_core_product: true,
    has_receivables: company.receivables.length > 0,
    receivables_type: company.receivables,
    receivables_recurrence_level: receivablesRecurrence(company.receivables),
    receivables_predictability_level: receivablesPredictability(company.receivables),
    has_fidc: /fidc/i.test(company.currentFundingStructure),
    has_securitization_structure: /fidc|securit/i.test(company.currentFundingStructure),
    has_existing_debt_structure: structuredFundingPresent,
    funding_structure_type: company.currentFundingStructure,
    capital_structure_quality: balanceSheetOnly ? 'weak' : structuredFundingPresent ? 'emerging' : 'partial',
    capital_structure_rationale: `Estrutura atual: ${company.currentFundingStructure}. ${rationale}`,
    funding_gap_level: capitalScore >= 78 ? 'high' : capitalScore >= 62 ? 'medium' : 'low',
    capital_dependency_level: balanceSheetOnly ? 'high' : structuredFundingPresent ? 'medium' : 'medium_high',
    growth_vs_funding_mismatch: urgency >= 78 ? 'elevated' : urgency >= 62 ? 'moderate' : 'low',
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
      monitoringOutputs: monitoringOutputs.map((item) => ({ sourceId: item.sourceId, title: item.title, summary: item.summary, confidenceScore: item.confidenceScore, connectorStatus: item.connectorStatus })),
      enrichment: company.enrichment,
      fundingStructure: company.currentFundingStructure,
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
