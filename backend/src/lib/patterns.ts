import type { CompanyPattern, CompanySeed, MonitoringOutput, PatternCatalogEntry, QualificationSnapshot } from '../types/platform.js';

const matches = (texts: string[], pattern: RegExp) => texts.some((text) => pattern.test(text.toLowerCase()));
const signalTypes = (company: CompanySeed) => company.signals.map((signal) => signal.type.toLowerCase());

export const detectCompanyPatterns = (
  company: CompanySeed,
  qualification: QualificationSnapshot,
  catalog: PatternCatalogEntry[],
  monitoringOutputs: MonitoringOutput[] = [],
): CompanyPattern[] => {
  const texts = [
    company.description,
    ...company.signals.map((signal) => `${signal.type} ${signal.note}`),
    ...monitoringOutputs.map((item) => `${item.title} ${item.summary}`),
  ];
  const signals = signalTypes(company);

  const rules: Record<string, boolean> = {
    'Capital mismatch for business model': qualification.capital_dependency_level === 'high' || qualification.growth_vs_funding_mismatch === 'elevated' || matches(texts, /funding|capital|warehouse|balanço próprio/),
    'Growth without structured funding': qualification.funding_gap_level !== 'low' && (qualification.urgency_score >= 68 || signals.includes('growth_without_funding')),
    'Strong receivables base with weak funding architecture': qualification.has_receivables && qualification.fit_fidc && (signals.includes('receivables_strong') || matches(texts, /receb[ií]veis|cartão|folha|assinatura/)),
    'Expansion outpacing capital structure': signals.includes('expansion_signal') || matches(texts, /expans|novo canal|nova regi|crescimento/),
    'Embedded finance with implicit balance-sheet pressure': company.segment === 'Embedded Finance' || signals.includes('embedded_finance') || matches(texts, /embedded|checkout|wallet|pix/),
  };

  return catalog
    .filter((pattern) => rules[pattern.patternName])
    .map((pattern, index) => ({
      id: `${company.id}_${pattern.id}`,
      companyId: company.id,
      patternId: pattern.id,
      patternName: pattern.patternName,
      rationale: `${pattern.description} Evidências: ${texts.filter(Boolean).slice(0, 3).join(' | ')}.`,
      confidenceScore: Number(Math.min(0.95, qualification.confidence_score + 0.04 + index * 0.02).toFixed(2)),
      qualificationImpact: pattern.qualificationImpact,
      leadScoreImpact: pattern.leadImpact,
      rankingImpact: pattern.rankingImpact,
      thesisImpact: `Influência direta na tese de ${qualification.suggested_structure_type}.`,
      evidencePayload: {
        matchedSignals: company.signals.map((signal) => signal.type),
        monitoringSources: monitoringOutputs.map((item) => item.sourceId),
        fundingStructure: qualification.funding_structure_type,
        suggestedStructure: qualification.suggested_structure_type,
      },
    }));
};
