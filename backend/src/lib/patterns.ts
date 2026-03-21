import type { CompanyPattern, CompanySeed, PatternCatalogEntry, QualificationSnapshot } from '../types/platform.js';

const hasSignal = (company: CompanySeed, signalType: string) => company.signals.some((signal) => signal.type === signalType && signal.strength >= 60);

export const detectCompanyPatterns = (company: CompanySeed, qualification: QualificationSnapshot, catalog: PatternCatalogEntry[]): CompanyPattern[] => {
  const candidates = catalog.filter((pattern) => {
    switch (pattern.patternName) {
      case 'Growth without structured funding':
        return qualification.funding_gap_level === 'high' && qualification.urgency_score >= 75;
      case 'Credit product without dedicated capital structure':
        return qualification.has_credit_product && !qualification.has_fidc && !qualification.has_securitization_structure;
      case 'Strong receivables base with weak funding architecture':
        return qualification.has_receivables && qualification.fit_fidc && qualification.capital_structure_quality !== 'strong';
      case 'Expansion outpacing capital structure':
        return hasSignal(company, 'regional_expansion') || hasSignal(company, 'expansion_announcement');
      case 'Embedded finance with implicit balance-sheet pressure':
        return company.segment === 'Embedded Finance' || hasSignal(company, 'embedded_finance_launch');
      case 'Sophisticated credit narrative, immature funding stack':
        return hasSignal(company, 'underwriting_story') || hasSignal(company, 'hiring_credit');
      case 'Operational maturity signals without capital market readiness yet':
        return qualification.operational_maturity_level === 'medium_high' && !qualification.fit_dcm;
      case 'Funding dependence hidden in commercial narrative':
        return hasSignal(company, 'balance_sheet_pressure') || company.currentFundingStructure.includes('Balanço próprio');
      case 'Capital mismatch for business model':
        return qualification.capital_dependency_level === 'high' || qualification.growth_vs_funding_mismatch === 'elevated';
      case 'Momentum + timing + structural gap':
        return qualification.urgency_score >= 70 && qualification.trigger_strength_score >= 70;
      default:
        return false;
    }
  });

  return candidates.map((pattern, index) => ({
    id: `${company.id}_${pattern.id}`,
    companyId: company.id,
    patternId: pattern.id,
    patternName: pattern.patternName,
    rationale: `${pattern.description} Evidências: ${company.signals.slice(0, 2).map((signal) => signal.note).join('; ')}.`,
    confidenceScore: Number(Math.min(0.94, qualification.confidence_score + index * 0.02).toFixed(2)),
    qualificationImpact: pattern.qualificationImpact,
    leadScoreImpact: pattern.leadImpact,
    rankingImpact: pattern.rankingImpact,
    thesisImpact: `Influência direta na tese de ${qualification.suggested_structure_type}.`,
    evidencePayload: {
      matchedSignals: company.signals.map((signal) => signal.type),
      fundingStructure: company.currentFundingStructure,
      suggestedStructure: qualification.suggested_structure_type,
    },
  }));
};
