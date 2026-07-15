import { computeSourceTreatmentImpact, hasTreatmentTag } from './sourceTreatment.js';
import type { CompanyPattern, CompanySeed, MonitoringOutput, PatternCatalogEntry, QualificationSnapshot } from '../types/platform.js';
import { buildDeterministicUuid } from '../modules/data-capture/documentFingerprint.js';

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
  const sourceTreatmentImpact = computeSourceTreatmentImpact(company.signals);
  const hasBalanceSheetFunding = /balanço próprio|caixa/.test(qualification.funding_structure_type.toLowerCase());
  const hasStructuredFunding = qualification.has_fidc || qualification.has_securitization_structure || /warehouse|deb[êe]nture|nota comercial|linhas bilaterais/.test(qualification.funding_structure_type.toLowerCase());
  const expansionEvidence = matches(texts, /expans|novo canal|nova regi|crescimento|parceir|escala|portfolio|rodada|investida/);
  const receivablesEvidence = matches(texts, /receb[ií]veis|duplicatas|cart[aã]o|mensalidades|pix parcelado|cpr|frete|pncp|contrato publico|empenho|exporta[cç][aã]o/);
  const capitalStressEvidence = matches(texts, /funding|capital|warehouse|deb[êe]nture|capital markets|balanço próprio|caixa|bndes|finep|pgfn|protesto|d[ií]vida ativa/);
  const embeddedFinanceEvidence = matches(texts, /embedded finance|open finance|institui[cç][aã]o de pagamento|checkout|pix|wallet|parcelamento|limite de cr[eé]dito|financiamento/);
  const readinessEvidence = matches(texts, /api|sdk|github|underwriting|risk|risco de cr[eé]dito|collections|cobran[cç]a|webinar|documenta[cç][aã]o/);
  const riskSignal = sourceTreatmentImpact.riskSignals.length > 0;

  const rules: Record<string, { matched: boolean; rationale: string; evidencePayload: Record<string, unknown>; confidence: number }> = {
    'Growth without structured funding': {
      matched: (expansionEvidence
        || normalizedSignals.has('expansion_signal')
        || normalizedSignals.has('expansion_announcement')
        || normalizedSignals.has('regional_expansion')
        || hasTreatmentTag(sourceTreatmentImpact, 'growth_without_funding')
        || hasTreatmentTag(sourceTreatmentImpact, 'expansion_outpacing_capital'))
        && !qualification.has_fidc
        && qualification.funding_gap_level !== 'low',
      rationale: 'A companhia apresenta sinais de crescimento/comercialização enquanto a estrutura de funding segue sem camada estruturada proporcional.',
      evidencePayload: {
        expansionEvidence,
        fundingStructure: qualification.funding_structure_type,
        sourceTreatmentImpact,
      },
      confidence: 0.78,
    },
    'Credit product without dedicated capital structure': {
      matched: (qualification.has_credit_product || hasTreatmentTag(sourceTreatmentImpact, 'credit_is_core'))
        && (hasBalanceSheetFunding || !hasStructuredFunding)
        && qualification.capital_dependency_level !== 'low',
      rationale: 'O produto de crédito já é core, mas ainda depende de balanço próprio ou funding tático sem veículo dedicado.',
      evidencePayload: {
        hasCreditProduct: qualification.has_credit_product,
        fundingStructure: qualification.funding_structure_type,
        capitalDependencyLevel: qualification.capital_dependency_level,
        sourceTreatmentImpact,
      },
      confidence: 0.8,
    },
    'Strong receivables base with weak funding architecture': {
      matched: qualification.has_receivables
        && (receivablesEvidence || hasTreatmentTag(sourceTreatmentImpact, 'receivables_strong'))
        && qualification.fit_fidc
        && (hasBalanceSheetFunding || qualification.capital_structure_quality !== 'strong'),
      rationale: 'Há lastro recorrente e previsível de recebíveis, mas a arquitetura de capital ainda não captura esse potencial via estrutura dedicada.',
      evidencePayload: {
        receivablesType: qualification.receivables_type,
        fitFidc: qualification.fit_fidc,
        fundingStructure: qualification.funding_structure_type,
        sourceTreatmentImpact,
      },
      confidence: 0.83,
    },
    'Expansion outpacing capital structure': {
      matched: (expansionEvidence || hasTreatmentTag(sourceTreatmentImpact, 'expansion') || hasTreatmentTag(sourceTreatmentImpact, 'expansion_outpacing_capital'))
        && qualification.urgency_score >= 65,
      rationale: 'O ritmo de expansão aparece nas fontes monitoradas em velocidade maior que a preparação de capital.',
      evidencePayload: {
        urgencyScore: qualification.urgency_score,
        growthMismatch: qualification.growth_vs_funding_mismatch,
        sourceTreatmentImpact,
      },
      confidence: 0.76,
    },
    'Embedded finance with implicit balance-sheet pressure': {
      matched: (embeddedFinanceEvidence || hasTreatmentTag(sourceTreatmentImpact, 'embedded_finance_pressure'))
        && (qualification.capital_dependency_level !== 'low' || hasBalanceSheetFunding || !hasStructuredFunding),
      rationale: 'A narrativa/produto de embedded finance indica pressão implícita de funding e necessidade de capital dedicado.',
      evidencePayload: {
        embeddedFinanceEvidence,
        fundingStructure: qualification.funding_structure_type,
        sourceTreatmentImpact,
      },
      confidence: 0.79,
    },
    'Sophisticated credit narrative, immature funding stack': {
      matched: (readinessEvidence || normalizedSignals.has('credit_team_hiring') || normalizedSignals.has('technical_product_signal'))
        && !qualification.has_fidc
        && qualification.capital_structure_quality !== 'strong',
      rationale: 'A companhia demonstra linguagem, time ou superfície técnica de crédito mais sofisticada que sua funding stack atual.',
      evidencePayload: {
        readinessEvidence,
        fundingStructure: qualification.funding_structure_type,
        sourceTreatmentImpact,
      },
      confidence: 0.77,
    },
    'Operational maturity signals without capital market readiness yet': {
      matched: (qualification.operational_maturity_level === 'medium_high' || qualification.operational_maturity_level === 'high' || readinessEvidence)
        && !qualification.has_fidc
        && (riskSignal || sourceTreatmentImpact.actionableSignalsCount >= 1 || !hasStructuredFunding),
      rationale: 'Há sinais de maturidade operacional, mas a prontidão para mercado de capitais ainda precisa de preparação.',
      evidencePayload: {
        operationalMaturity: qualification.operational_maturity_level,
        riskSignal,
        hasStructuredFunding,
        sourceTreatmentImpact,
      },
      confidence: 0.72,
    },
    'Funding dependence hidden in commercial narrative': {
      matched: (hasTreatmentTag(sourceTreatmentImpact, 'product_launch')
        || hasTreatmentTag(sourceTreatmentImpact, 'timing_trigger')
        || hasTreatmentTag(sourceTreatmentImpact, 'funding_gap')
        || embeddedFinanceEvidence)
        && qualification.capital_dependency_level !== 'low',
      rationale: 'A narrativa comercial indica produto, lançamento ou expansão que depende materialmente de funding ainda pouco explícito.',
      evidencePayload: {
        capitalDependencyLevel: qualification.capital_dependency_level,
        embeddedFinanceEvidence,
        sourceTreatmentImpact,
      },
      confidence: 0.75,
    },
    'Capital mismatch for business model': {
      matched: (capitalStressEvidence || hasTreatmentTag(sourceTreatmentImpact, 'capital_mismatch'))
        && (qualification.capital_dependency_level === 'high' || qualification.growth_vs_funding_mismatch !== 'low' || hasBalanceSheetFunding),
      rationale: 'O modelo de negócio exige duration/captação mais aderentes do que a estrutura hoje disponível.',
      evidencePayload: {
        capitalDependencyLevel: qualification.capital_dependency_level,
        growthMismatch: qualification.growth_vs_funding_mismatch,
        fundingStructure: qualification.funding_structure_type,
        sourceTreatmentImpact,
      },
      confidence: 0.84,
    },
    'Momentum + timing + structural gap': {
      matched: sourceTreatmentImpact.actionableSignalsCount >= 2
        && qualification.urgency_score >= 65
        && qualification.funding_gap_level !== 'low',
      rationale: 'A combinação de gatilhos recentes, timing e gap estrutural cria janela comercial clara para abordagem.',
      evidencePayload: {
        actionableSignalsCount: sourceTreatmentImpact.actionableSignalsCount,
        urgencyScore: qualification.urgency_score,
        fundingGapLevel: qualification.funding_gap_level,
        sourceTreatmentImpact,
      },
      confidence: 0.82,
    },
  };

  return catalog
    .filter((pattern) => rules[pattern.patternName]?.matched)
    .map((pattern, index) => {
      const rule = rules[pattern.patternName];
      const evidence = texts.slice(0, 4);
      return {
        id: buildDeterministicUuid(['company_pattern', company.id, pattern.id]),
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
