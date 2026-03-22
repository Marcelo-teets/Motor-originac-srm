import type { CompanyPattern, CompanySeed, MonitoringOutput, PatternCatalogEntry, QualificationSnapshot } from '../types/platform.js';

const matches = (texts: string[], pattern: RegExp) => texts.some((text) => pattern.test(text.toLowerCase()));
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '_');

export const detectCompanyPatterns = (
  company: CompanySeed,
  qualification: QualificationSnapshot,
  catalog: PatternCatalogEntry[],
  monitoringOutputs: MonitoringOutput[] = [],
): CompanyPattern[] => {
  const signalTexts = company.signals.map((signal) => `${signal.type} ${signal.note}`);
  const outputTexts = monitoringOutputs.map((item) => `${item.title} ${item.summary}`);
  const texts = [company.description, ...signalTexts, ...outputTexts].filter(Boolean);
  const normalizedSignals = new Set(company.signals.map((signal) => normalize(signal.type)));
  const hasBalanceSheetFunding = /balanço próprio|caixa/.test(qualification.funding_structure_type.toLowerCase());
  const hasStructuredFunding = qualification.has_fidc || qualification.has_securitization_structure || /warehouse|deb[êe]nture|nota comercial|linhas bilaterais/.test(qualification.funding_structure_type.toLowerCase());
  const expansionEvidence = matches(texts, /expans|novo canal|nova regi|crescimento|parceir|escala/);
  const receivablesEvidence = matches(texts, /receb[ií]veis|duplicatas|cart[aã]o|mensalidades|pix parcelado|cpr|frete/);
  const capitalStressEvidence = matches(texts, /funding|capital|warehouse|deb[êe]nture|capital markets|balanço próprio|caixa/);

  const rules: Record<string, { matched: boolean; rationale: string; evidencePayload: Record<string, unknown>; confidence: number }> = {
    'Growth without structured funding': {
      matched: (expansionEvidence || normalizedSignals.has('expansion_signal') || normalizedSignals.has('expansion_announcement') || normalizedSignals.has('regional_expansion'))
        && !qualification.has_fidc
        && qualification.funding_gap_level !== 'low',
      rationale: 'A companhia apresenta sinais de crescimento/comercialização enquanto a estrutura de funding segue sem camada estruturada proporcional.',
      evidencePayload: {
        expansionEvidence,
        fundingStructure: qualification.funding_structure_type,
        matchedSignals: Array.from(normalizedSignals),
      },
      confidence: 0.78,
    },
    'Credit product without dedicated capital structure': {
      matched: qualification.has_credit_product && (hasBalanceSheetFunding || !hasStructuredFunding) && qualification.capital_dependency_level !== 'low',
      rationale: 'O produto de crédito já é core, mas ainda depende de balanço próprio ou funding tático sem veículo dedicado.',
      evidencePayload: {
        hasCreditProduct: qualification.has_credit_product,
        fundingStructure: qualification.funding_structure_type,
        capitalDependencyLevel: qualification.capital_dependency_level,
      },
      confidence: 0.8,
    },
    'Strong receivables base with weak funding architecture': {
      matched: qualification.has_receivables && receivablesEvidence && qualification.fit_fidc && (hasBalanceSheetFunding || qualification.capital_structure_quality !== 'strong'),
      rationale: 'Há lastro recorrente e previsível de recebíveis, mas a arquitetura de capital ainda não captura esse potencial via estrutura dedicada.',
      evidencePayload: {
        receivablesType: qualification.receivables_type,
        fitFidc: qualification.fit_fidc,
        fundingStructure: qualification.funding_structure_type,
      },
      confidence: 0.83,
    },
    'Expansion outpacing capital structure': {
      matched: expansionEvidence && qualification.urgency_score >= 65,
      rationale: 'O ritmo de expansão aparece nas fontes monitoradas em velocidade maior que a preparação de capital.',
      evidencePayload: {
        urgencyScore: qualification.urgency_score,
        growthMismatch: qualification.growth_vs_funding_mismatch,
      },
      confidence: 0.76,
    },
    'Capital mismatch for business model': {
      matched: capitalStressEvidence && (qualification.capital_dependency_level === 'high' || qualification.growth_vs_funding_mismatch !== 'low' || hasBalanceSheetFunding),
      rationale: 'O modelo de negócio exige duration/captação mais aderentes do que a estrutura hoje disponível.',
      evidencePayload: {
        capitalDependencyLevel: qualification.capital_dependency_level,
        growthMismatch: qualification.growth_vs_funding_mismatch,
        fundingStructure: qualification.funding_structure_type,
      },
      confidence: 0.84,
    },
  };

  return catalog
    .filter((pattern) => rules[pattern.patternName]?.matched)
    .map((pattern, index) => {
      const rule = rules[pattern.patternName];
      const evidence = texts.slice(0, 4);
      return {
        id: `${company.id}_${pattern.id}`,
        companyId: company.id,
        patternId: pattern.id,
        patternName: pattern.patternName,
        rationale: `${rule.rationale} Evidências: ${evidence.join(' | ')}.`,
        confidenceScore: Number(Math.min(0.95, Math.max(rule.confidence, qualification.confidence_score + index * 0.015)).toFixed(2)),
        qualificationImpact: pattern.qualificationImpact,
        leadScoreImpact: pattern.leadImpact,
        rankingImpact: pattern.rankingImpact,
        thesisImpact: `Impacta a recomendação de ${qualification.suggested_structure_type}.`,
        evidencePayload: {
          ...rule.evidencePayload,
          matchedSignals: company.signals.map((signal) => signal.type),
          monitoringSources: monitoringOutputs.map((item) => item.sourceId),
          excerpts: evidence,
        },
      } satisfies CompanyPattern;
    });
};
