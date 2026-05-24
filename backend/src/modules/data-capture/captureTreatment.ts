import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput } from '../../types/platform.js';

const TREATMENT_VERSION = 'capture_treatment_v1';

type SignalFamily =
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

type OutputTreatment = {
  outputId: string;
  title: string;
  sourceId: string;
  relevanceScore: number;
  signalFamilies: SignalFamily[];
  suggestedStructures: string[];
  detectedKeywords: string[];
  evidenceLevel: 'observed' | 'inferred';
  recommendedNextAction: string;
  sourceUrl?: string;
};

export type CaptureTreatmentDiagnostics = {
  treatmentVersion: string;
  highRelevanceOutputs: number;
  treatmentGeneratedSignals: number;
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
    keywords: ['funding', 'capital', 'caixa', 'capitalizacao', 'capta', 'dívida', 'divida', 'working capital', 'runway', 'liquidez'],
    suggestedStructures: ['FIDC', 'Nota Comercial', 'Debênture'],
    evidenceLevel: 'inferred',
    nextAction: 'Validar necessidade de funding, prazo, ticket e custo atual de capital.',
  },
  {
    family: 'fidc_fit',
    signalType: 'fidc_fit_signal',
    label: 'Fit potencial para FIDC',
    weight: 88,
    keywords: ['fidc', 'securitizacao', 'securitização', 'cessao', 'cessão', 'direitos creditorios', 'direitos creditórios', 'carteira de credito', 'carteira de crédito'],
    suggestedStructures: ['FIDC'],
    evidenceLevel: 'observed',
    nextAction: 'Checar ativo-lastro, histórico de performance, elegibilidade e waterfall possível.',
  },
  {
    family: 'dcm_fit',
    signalType: 'dcm_fit_signal',
    label: 'Fit potencial para DCM',
    weight: 76,
    keywords: ['debenture', 'debênture', 'nota comercial', 'cri', 'cra', 'mercado de capitais', 'emissao', 'emissão', 'alongamento'],
    suggestedStructures: ['Nota Comercial', 'Debênture', 'CRA/CRI'],
    evidenceLevel: 'observed',
    nextAction: 'Validar estrutura de capital, garantias, covenants e apetite de investidores.',
  },
  {
    family: 'growth_timing',
    signalType: 'growth_timing_trigger',
    label: 'Timing de crescimento',
    weight: 72,
    keywords: ['expansao', 'expansão', 'crescimento', 'nova regiao', 'nova região', 'contratando', 'vagas', 'novo produto', 'parceria', 'aquisicao', 'aquisição'],
    suggestedStructures: ['FIDC', 'Nota Comercial'],
    evidenceLevel: 'inferred',
    nextAction: 'Entender se o crescimento está pressionando capital de giro ou funding escalável.',
  },
  {
    family: 'risk_validation',
    signalType: 'risk_validation_signal',
    label: 'Risco a validar',
    weight: 64,
    keywords: ['inadimplencia', 'inadimplência', 'provisao', 'provisão', 'chargeback', 'default', 'atraso', 'risco', 'reestruturacao', 'reestruturação'],
    suggestedStructures: ['Validação de crédito'],
    evidenceLevel: 'inferred',
    nextAction: 'Validar qualidade da carteira, vintage, concentração, perdas e mitigadores.',
  },
];

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalize = (value: string) => stripDiacritics(value).toLowerCase().replace(/\s+/g, ' ').trim();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const unique = <T>(values: T[]) => [...new Set(values)];

const asSourceConfidencePercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
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

const sourceUrlFromOutput = (output: MonitoringOutput) => pickString(
  output.normalizedPayload?.sourceUrl,
  output.normalizedPayload?.canonicalUrl,
  output.normalizedPayload?.endpoint,
  firstItemLink(output.normalizedPayload?.items),
);

const payloadToSearchText = (payload: Record<string, unknown>) => {
  try {
    return JSON.stringify(payload).slice(0, 2400);
  } catch {
    return '';
  }
};

const matchRules = (output: MonitoringOutput): TreatmentMatch[] => {
  const text = normalize(`${output.title} ${output.summary} ${payloadToSearchText(output.normalizedPayload)}`);

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

const preferredNextAction = (matches: TreatmentMatch[]) => {
  const priority: SignalFamily[] = ['fidc_fit', 'receivables', 'credit_product', 'funding_need', 'dcm_fit', 'growth_timing', 'risk_validation'];
  const best = priority
    .map((family) => matches.find((match) => match.rule.family === family))
    .find(Boolean);

  return best?.rule.nextAction ?? 'Manter em monitoramento e aguardar novo sinal corroborado.';
};

const toTreatment = (output: MonitoringOutput, matches: TreatmentMatch[]): OutputTreatment => {
  const relevanceScore = relevanceScoreFor(output, matches);
  return {
    outputId: output.id,
    title: output.title,
    sourceId: output.sourceId,
    relevanceScore,
    signalFamilies: unique(matches.map((match) => match.rule.family)),
    suggestedStructures: unique(matches.flatMap((match) => match.rule.suggestedStructures)),
    detectedKeywords: unique(matches.flatMap((match) => match.keywords)).slice(0, 12),
    evidenceLevel: matches.some((match) => match.rule.evidenceLevel === 'observed') ? 'observed' : 'inferred',
    recommendedNextAction: preferredNextAction(matches),
    sourceUrl: sourceUrlFromOutput(output),
  };
};

const annotateOutput = (output: MonitoringOutput, treatment: OutputTreatment): MonitoringOutput => ({
  ...output,
  normalizedPayload: {
    ...output.normalizedPayload,
    treatment: {
      version: TREATMENT_VERSION,
      relevanceScore: treatment.relevanceScore,
      signalFamilies: treatment.signalFamilies,
      suggestedStructures: treatment.suggestedStructures,
      detectedKeywords: treatment.detectedKeywords,
      evidenceLevel: treatment.evidenceLevel,
      recommendedNextAction: treatment.recommendedNextAction,
    },
  },
});

const buildTreatmentSignals = (
  company: CompanySeed,
  output: MonitoringOutput,
  treatment: OutputTreatment,
  matches: TreatmentMatch[],
  collectedAt: string,
): CompanySignal[] => {
  if (treatment.relevanceScore < 55) return [];

  return matches.slice(0, 4).map((match) => ({
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId: output.sourceId,
    signalType: match.rule.signalType,
    signalStrength: clamp(Math.round((treatment.relevanceScore + match.rule.weight) / 2), 0, 100),
    confidenceScore: clamp((asSourceConfidencePercent(output.confidenceScore) + treatment.relevanceScore) / 200, 0.35, 0.96),
    evidencePayload: {
      treatmentVersion: TREATMENT_VERSION,
      label: match.rule.label,
      note: `${match.rule.label}: ${output.title}`,
      summary: output.summary,
      outputId: output.id,
      sourceId: output.sourceId,
      sourceUrl: treatment.sourceUrl,
      family: match.rule.family,
      keywords: match.keywords,
      relevanceScore: treatment.relevanceScore,
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
  treatments: OutputTreatment[],
  collectedAt: string,
): EnrichmentRecord[] => {
  const relevantTreatments = treatments.filter((treatment) => treatment.relevanceScore >= 55);
  if (!relevantTreatments.length) return [];

  const suggestedStructures = unique(relevantTreatments.flatMap((treatment) => treatment.suggestedStructures));
  const dominantSignalFamilies = unique(relevantTreatments.flatMap((treatment) => treatment.signalFamilies));
  const nextActions = unique(relevantTreatments.map((treatment) => treatment.recommendedNextAction));

  return [{
    id: crypto.randomUUID(),
    companyId: company.id,
    enrichmentType: 'capture_treatment_profile',
    provider: 'data_capture_engine',
    payload: {
      treatmentVersion: TREATMENT_VERSION,
      highRelevanceOutputs: relevantTreatments.length,
      averageRelevanceScore: Math.round(relevantTreatments.reduce((sum, item) => sum + item.relevanceScore, 0) / relevantTreatments.length),
      dominantSignalFamilies,
      suggestedStructures,
      recommendedNextActions: nextActions,
      outputs: relevantTreatments.map((treatment) => ({
        outputId: treatment.outputId,
        title: treatment.title,
        sourceId: treatment.sourceId,
        relevanceScore: treatment.relevanceScore,
        signalFamilies: treatment.signalFamilies,
        suggestedStructures: treatment.suggestedStructures,
        detectedKeywords: treatment.detectedKeywords,
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
  diagnostics: CaptureTreatmentDiagnostics;
} => {
  const treated = outputs.map((output) => {
    const matches = matchRules(output);
    const treatment = toTreatment(output, matches);
    const annotatedOutput = annotateOutput(output, treatment);
    const signals = buildTreatmentSignals(company, annotatedOutput, treatment, matches, collectedAt);
    return { output: annotatedOutput, treatment, signals };
  });

  const treatments = treated.map((item) => item.treatment);
  const signals = treated.flatMap((item) => item.signals);
  const enrichments = buildTreatmentEnrichment(company, treatments, collectedAt);

  return {
    outputs: treated.map((item) => item.output),
    signals,
    enrichments,
    diagnostics: {
      treatmentVersion: TREATMENT_VERSION,
      highRelevanceOutputs: treatments.filter((treatment) => treatment.relevanceScore >= 55).length,
      treatmentGeneratedSignals: signals.length,
      suggestedStructures: unique(treatments.flatMap((treatment) => treatment.suggestedStructures)),
      dominantSignalFamilies: unique(treatments.flatMap((treatment) => treatment.signalFamilies)),
    },
  };
};
