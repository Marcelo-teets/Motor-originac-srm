import { createHash } from 'node:crypto';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput } from '../../types/platform.js';
import type { TreatmentResultRecord } from './types.js';

export const CAPTURE_TREATMENT_VERSION = 'capture_treatment_v2';
const SIGNAL_RELEVANCE_FLOOR = 55;
const SIGNAL_QUALITY_FLOOR = 55;

export type SignalFamily =
  | 'credit_product'
  | 'receivables'
  | 'funding_need'
  | 'fidc_fit'
  | 'dcm_fit'
  | 'growth_timing'
  | 'risk_validation';

type TreatmentRule = {
  family: SignalFamily;
  signalType: string;
  label: string;
  weight: number;
  keywords: string[];
  suggestedStructures: string[];
  evidenceLevel: 'observed' | 'inferred';
  nextAction: string;
};

type TreatmentMatch = {
  rule: TreatmentRule;
  keywords: string[];
};

export type CaptureTreatmentDiagnostics = {
  treatmentVersion: string;
  outputsTreated: number;
  highRelevanceOutputs: number;
  decisionEligibleOutputs: number;
  treatmentGeneratedSignals: number;
  averageQualityScore: number;
  suggestedStructures: string[];
  dominantSignalFamilies: SignalFamily[];
};

const RULES: TreatmentRule[] = [
  {
    family: 'credit_product',
    signalType: 'credit_product_detected',
    label: 'Produto de crédito detectado',
    weight: 82,
    keywords: ['credito', 'emprestimo', 'financiamento', 'lending', 'bnpl', 'parcelamento', 'capital de giro', 'limite de credito'],
    suggestedStructures: ['FIDC', 'Nota Comercial', 'CCB'],
    evidenceLevel: 'observed',
    nextAction: 'Validar se o produto de crédito é core e qual funding suporta a carteira.',
  },
  {
    family: 'receivables',
    signalType: 'receivables_detected',
    label: 'Recebíveis detectados',
    weight: 86,
    keywords: ['recebiveis', 'antecipacao', 'cartao', 'duplicata', 'boletos', 'mensalidades', 'contratos recorrentes', 'assinatura', 'parcelas'],
    suggestedStructures: ['FIDC'],
    evidenceLevel: 'observed',
    nextAction: 'Mapear tipo, recorrência, elegibilidade e concentração dos recebíveis.',
  },
  {
    family: 'funding_need',
    signalType: 'funding_gap_signal',
    label: 'Possível funding gap',
    weight: 78,
    keywords: ['funding', 'capital', 'caixa', 'capitalizacao', 'capta', 'divida', 'working capital', 'runway', 'liquidez'],
    suggestedStructures: ['FIDC', 'Nota Comercial', 'Debênture'],
    evidenceLevel: 'inferred',
    nextAction: 'Validar necessidade de funding, prazo, ticket e custo atual de capital.',
  },
  {
    family: 'fidc_fit',
    signalType: 'fidc_fit_signal',
    label: 'Fit potencial para FIDC',
    weight: 88,
    keywords: ['fidc', 'securitizacao', 'cessao', 'direitos creditorios', 'carteira de credito'],
    suggestedStructures: ['FIDC'],
    evidenceLevel: 'observed',
    nextAction: 'Checar ativo-lastro, histórico de performance, elegibilidade e waterfall possível.',
  },
  {
    family: 'dcm_fit',
    signalType: 'dcm_fit_signal',
    label: 'Fit potencial para DCM',
    weight: 76,
    keywords: ['debenture', 'nota comercial', 'cri', 'cra', 'mercado de capitais', 'emissao', 'alongamento'],
    suggestedStructures: ['Nota Comercial', 'Debênture', 'CRA/CRI'],
    evidenceLevel: 'observed',
    nextAction: 'Validar estrutura de capital, garantias, covenants e apetite de investidores.',
  },
  {
    family: 'growth_timing',
    signalType: 'growth_timing_trigger',
    label: 'Timing de crescimento',
    weight: 72,
    keywords: ['expansao', 'crescimento', 'nova regiao', 'contratando', 'vagas', 'novo produto', 'parceria', 'aquisicao'],
    suggestedStructures: ['FIDC', 'Nota Comercial'],
    evidenceLevel: 'inferred',
    nextAction: 'Entender se o crescimento está pressionando capital de giro ou funding escalável.',
  },
  {
    family: 'risk_validation',
    signalType: 'risk_validation_signal',
    label: 'Risco a validar',
    weight: 64,
    keywords: ['inadimplencia', 'provisao', 'chargeback', 'default', 'atraso', 'risco', 'reestruturacao'],
    suggestedStructures: ['Validação de crédito'],
    evidenceLevel: 'inferred',
    nextAction: 'Validar qualidade da carteira, vintage, concentração, perdas e mitigadores.',
  },
];

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalize = (value: string) => stripDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const unique = <T>(values: T[]) => [...new Set(values)];
const round = (value: number) => Math.round(value * 100) / 100;

const deterministicUuid = (value: string) => {
  const bytes = Buffer.from(createHash('sha256').update(value).digest('hex').slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const asSourceConfidencePercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return clamp(value <= 1 ? Math.round(value * 100) : Math.round(value), 0, 100);
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const firstItemLink = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  if (!first || typeof first !== 'object') return undefined;
  return pickString((first as Record<string, unknown>).link, (first as Record<string, unknown>).url);
};

const canonicalizeUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'].forEach((key) => url.searchParams.delete(key));
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return value.trim();
  }
};

const sourceUrlFromOutput = (output: MonitoringOutput) => canonicalizeUrl(pickString(
  output.normalizedPayload?.sourceUrl,
  output.normalizedPayload?.canonicalUrl,
  output.normalizedPayload?.endpoint,
  firstItemLink(output.normalizedPayload?.items),
));

const payloadToSearchText = (payload: Record<string, unknown>) => {
  try {
    return JSON.stringify(payload).slice(0, 4800);
  } catch {
    return '';
  }
};

const searchableText = (output: MonitoringOutput) => normalize(
  `${output.title} ${output.summary} ${payloadToSearchText(output.normalizedPayload)}`,
);

const matchRules = (output: MonitoringOutput): TreatmentMatch[] => {
  const text = searchableText(output);
  return RULES.map((rule) => {
    const keywords = rule.keywords.filter((keyword) => text.includes(normalize(keyword)));
    return keywords.length ? { rule, keywords } : null;
  }).filter((match): match is TreatmentMatch => Boolean(match));
};

const relevanceScoreFor = (output: MonitoringOutput, matches: TreatmentMatch[]) => {
  if (!matches.length) return asSourceConfidencePercent(output.confidenceScore) >= 80 ? 42 : 28;

  const sourceConfidence = asSourceConfidencePercent(output.confidenceScore);
  const explicitBonus = matches.some((match) => match.rule.evidenceLevel === 'observed') ? 10 : 0;
  const multiSignalBonus = Math.min(16, Math.max(0, matches.length - 1) * 6);
  const maxRuleWeight = Math.max(...matches.map((match) => match.rule.weight));
  return clamp(Math.round(maxRuleWeight * 0.72 + sourceConfidence * 0.22 + explicitBonus + multiSignalBonus), 0, 100);
};

const evidenceAgeDays = (output: MonitoringOutput) => {
  const timestamp = Date.parse(output.collectedAt);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
};

const qualityFor = (output: MonitoringOutput, sourceUrl?: string) => {
  const issues: string[] = [];
  const confidence = asSourceConfidencePercent(output.confidenceScore);
  const summaryLength = output.summary.trim().length;
  const titleLength = output.title.trim().length;
  const ageDays = evidenceAgeDays(output);

  if (output.connectorStatus !== 'real') issues.push('partial_connector');
  if (!sourceUrl) issues.push('missing_source_url');
  if (summaryLength < 50) issues.push('thin_content');
  if (confidence < 55) issues.push('low_source_confidence');
  if (ageDays !== null && ageDays > 120) issues.push('stale_evidence');

  let score = confidence * 0.55;
  score += output.connectorStatus === 'real' ? 20 : 5;
  score += sourceUrl ? 10 : 0;
  score += titleLength >= 8 ? 5 : 0;
  score += summaryLength >= 120 ? 10 : summaryLength >= 50 ? 6 : 0;
  if (ageDays !== null && ageDays > 120) score -= 12;
  else if (ageDays !== null && ageDays > 45) score -= 5;

  return { qualityScore: clamp(Math.round(score), 0, 100), qualityIssues: issues };
};

const extractNormalizedFacts = (output: MonitoringOutput, matches: TreatmentMatch[]) => {
  const rawText = `${output.title} ${output.summary} ${payloadToSearchText(output.normalizedPayload)}`;
  const moneyAmounts = unique(rawText.match(/R\$\s?[\d.,]+(?:\s?(?:mil|milh(?:a|ã)o|milh(?:o|õ)es|bilh(?:a|ã)o|bilh(?:o|õ)es))?/gi) ?? []).slice(0, 8);
  const percentages = unique(rawText.match(/\b\d+(?:[.,]\d+)?\s?%/g) ?? []).slice(0, 8);
  const cnpjMentions = unique(rawText.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) ?? []).slice(0, 4);

  return {
    moneyAmounts,
    percentages,
    cnpjMentions,
    signalFamilies: unique(matches.map((match) => match.rule.family)),
    structureHints: unique(matches.flatMap((match) => match.rule.suggestedStructures)),
  };
};

const contentFingerprintFor = (output: MonitoringOutput, sourceUrl?: string) => createHash('sha256')
  .update([
    output.companyId,
    output.sourceId,
    normalize(output.title),
    normalize(output.summary),
    sourceUrl ?? '',
  ].join('|'))
  .digest('hex');

const preferredNextAction = (matches: TreatmentMatch[]) => {
  const priority: SignalFamily[] = ['fidc_fit', 'receivables', 'credit_product', 'funding_need', 'dcm_fit', 'growth_timing', 'risk_validation'];
  const best = priority.map((family) => matches.find((match) => match.rule.family === family)).find(Boolean);
  return best?.rule.nextAction ?? 'Manter em monitoramento e aguardar novo sinal corroborado.';
};

const toTreatment = (output: MonitoringOutput, matches: TreatmentMatch[]): TreatmentResultRecord => {
  const sourceUrl = sourceUrlFromOutput(output);
  const relevanceScore = relevanceScoreFor(output, matches);
  const { qualityScore, qualityIssues } = qualityFor(output, sourceUrl);
  const confidenceScore = round(clamp((asSourceConfidencePercent(output.confidenceScore) * 0.6 + qualityScore * 0.4) / 100, 0, 1));
  const evidenceLevel = matches.some((match) => match.rule.evidenceLevel === 'observed') ? 'observed' : 'inferred';
  const contentFingerprint = contentFingerprintFor(output, sourceUrl);
  const normalizedFacts = extractNormalizedFacts(output, matches);

  return {
    outputId: output.id,
    companyId: output.companyId,
    sourceId: output.sourceId,
    treatmentVersion: CAPTURE_TREATMENT_VERSION,
    contentFingerprint,
    relevanceScore,
    qualityScore,
    confidenceScore,
    signalFamilies: unique(matches.map((match) => match.rule.family)),
    suggestedStructures: unique(matches.flatMap((match) => match.rule.suggestedStructures)),
    detectedKeywords: unique(matches.flatMap((match) => match.keywords)).slice(0, 16),
    evidenceLevel,
    normalizedFacts,
    qualityIssues,
    recommendedNextAction: preferredNextAction(matches),
    sourceUrl,
    intrinsicDecisionEligible: relevanceScore >= SIGNAL_RELEVANCE_FLOOR && qualityScore >= SIGNAL_QUALITY_FLOOR,
    lineage: {
      monitoringOutputId: output.id,
      companyId: output.companyId,
      sourceId: output.sourceId,
      sourceUrl: sourceUrl ?? null,
      observedAt: output.collectedAt,
      connectorStatus: output.connectorStatus,
      sourceConfidence: asSourceConfidencePercent(output.confidenceScore),
    },
  };
};

const annotateOutput = (output: MonitoringOutput, treatment: TreatmentResultRecord): MonitoringOutput => ({
  ...output,
  normalizedPayload: {
    ...output.normalizedPayload,
    treatment: {
      version: treatment.treatmentVersion,
      contentFingerprint: treatment.contentFingerprint,
      relevanceScore: treatment.relevanceScore,
      qualityScore: treatment.qualityScore,
      confidenceScore: treatment.confidenceScore,
      signalFamilies: treatment.signalFamilies,
      suggestedStructures: treatment.suggestedStructures,
      detectedKeywords: treatment.detectedKeywords,
      evidenceLevel: treatment.evidenceLevel,
      normalizedFacts: treatment.normalizedFacts,
      qualityIssues: treatment.qualityIssues,
      intrinsicDecisionEligible: treatment.intrinsicDecisionEligible,
      recommendedNextAction: treatment.recommendedNextAction,
    },
  },
});

const buildTreatmentSignals = (
  company: CompanySeed,
  output: MonitoringOutput,
  treatment: TreatmentResultRecord,
  matches: TreatmentMatch[],
  collectedAt: string,
): CompanySignal[] => {
  if (!treatment.intrinsicDecisionEligible) return [];

  return matches.slice(0, 4).map((match) => ({
    id: deterministicUuid(`${CAPTURE_TREATMENT_VERSION}|${treatment.contentFingerprint}|${match.rule.signalType}`),
    companyId: company.id,
    sourceId: output.sourceId,
    signalType: match.rule.signalType,
    signalStrength: clamp(Math.round((treatment.relevanceScore + treatment.qualityScore + match.rule.weight) / 3), 0, 100),
    confidenceScore: clamp(round((treatment.confidenceScore + asSourceConfidencePercent(output.confidenceScore) / 100) / 2), 0.35, 0.98),
    evidencePayload: {
      treatmentVersion: CAPTURE_TREATMENT_VERSION,
      contentFingerprint: treatment.contentFingerprint,
      label: match.rule.label,
      note: `${match.rule.label}: ${output.title}`,
      summary: output.summary,
      outputId: output.id,
      sourceId: output.sourceId,
      sourceUrl: treatment.sourceUrl,
      family: match.rule.family,
      keywords: match.keywords,
      relevanceScore: treatment.relevanceScore,
      qualityScore: treatment.qualityScore,
      normalizedFacts: treatment.normalizedFacts,
      suggestedStructures: treatment.suggestedStructures,
      recommendedNextAction: treatment.recommendedNextAction,
      observedAt: output.collectedAt,
    },
    observedVsInferred: match.rule.evidenceLevel,
    createdAt: collectedAt,
  }));
};

const buildTreatmentEnrichment = (
  company: CompanySeed,
  treatments: TreatmentResultRecord[],
  collectedAt: string,
): EnrichmentRecord[] => {
  const eligible = treatments.filter((treatment) => treatment.intrinsicDecisionEligible);
  if (!eligible.length) return [];

  const suggestedStructures = unique(eligible.flatMap((treatment) => treatment.suggestedStructures));
  const dominantSignalFamilies = unique(eligible.flatMap((treatment) => treatment.signalFamilies));
  const nextActions = unique(eligible.map((treatment) => treatment.recommendedNextAction));
  const fingerprintSet = eligible.map((item) => item.contentFingerprint).sort().join('|');

  return [{
    id: deterministicUuid(`${CAPTURE_TREATMENT_VERSION}|${company.id}|${fingerprintSet}`),
    companyId: company.id,
    enrichmentType: 'capture_treatment_profile_v2',
    provider: 'data_treatment_enrichment_engine',
    payload: {
      treatmentVersion: CAPTURE_TREATMENT_VERSION,
      highRelevanceOutputs: eligible.length,
      averageRelevanceScore: Math.round(eligible.reduce((sum, item) => sum + item.relevanceScore, 0) / eligible.length),
      averageQualityScore: Math.round(eligible.reduce((sum, item) => sum + item.qualityScore, 0) / eligible.length),
      dominantSignalFamilies,
      suggestedStructures,
      recommendedNextActions: nextActions,
      outputs: eligible.map((treatment) => ({
        outputId: treatment.outputId,
        contentFingerprint: treatment.contentFingerprint,
        sourceId: treatment.sourceId,
        relevanceScore: treatment.relevanceScore,
        qualityScore: treatment.qualityScore,
        signalFamilies: treatment.signalFamilies,
        suggestedStructures: treatment.suggestedStructures,
        normalizedFacts: treatment.normalizedFacts,
        sourceUrl: treatment.sourceUrl,
      })),
      createdAt: collectedAt,
    },
    observedVsInferred: 'inferred',
    createdAt: collectedAt,
  }];
};

export const treatCaptureOutputs = (
  company: CompanySeed,
  outputs: MonitoringOutput[],
  collectedAt: string,
): {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
  treatmentResults: TreatmentResultRecord[];
  diagnostics: CaptureTreatmentDiagnostics;
} => {
  const treated = outputs.map((output) => {
    const matches = matchRules(output);
    const treatment = toTreatment(output, matches);
    const annotatedOutput = annotateOutput(output, treatment);
    const signals = buildTreatmentSignals(company, annotatedOutput, treatment, matches, collectedAt);
    return { output: annotatedOutput, treatment, signals };
  });

  const treatmentResults = treated.map((item) => item.treatment);
  const signals = treated.flatMap((item) => item.signals);
  const enrichments = buildTreatmentEnrichment(company, treatmentResults, collectedAt);
  const averageQualityScore = treatmentResults.length
    ? Math.round(treatmentResults.reduce((sum, item) => sum + item.qualityScore, 0) / treatmentResults.length)
    : 0;

  return {
    outputs: treated.map((item) => item.output),
    signals,
    enrichments,
    treatmentResults,
    diagnostics: {
      treatmentVersion: CAPTURE_TREATMENT_VERSION,
      outputsTreated: treatmentResults.length,
      highRelevanceOutputs: treatmentResults.filter((treatment) => treatment.relevanceScore >= SIGNAL_RELEVANCE_FLOOR).length,
      decisionEligibleOutputs: treatmentResults.filter((treatment) => treatment.intrinsicDecisionEligible).length,
      treatmentGeneratedSignals: signals.length,
      averageQualityScore,
      suggestedStructures: unique(treatmentResults.flatMap((treatment) => treatment.suggestedStructures)),
      dominantSignalFamilies: unique(treatmentResults.flatMap((treatment) => treatment.signalFamilies)) as SignalFamily[],
    },
  };
};
