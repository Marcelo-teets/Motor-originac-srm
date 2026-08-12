export type CandidateCommercialRole =
  | 'operating_company'
  | 'financial_intermediary'
  | 'needs_classification'
  | 'non_entity';

export type CandidateCommercialSignalClass =
  | 'direct_funding_trigger'
  | 'funding_plan_trigger'
  | 'credit_expansion_trigger'
  | 'market_intermediary_activity'
  | 'editorial_noise'
  | 'relevant_unclassified';

export type CandidateCommercialSemanticsInput = {
  companyName: string;
  sourceRef: string;
  evidenceSummary?: string | null;
  rawPayload?: Record<string, unknown> | null;
};

export type CandidateCommercialSemantics = {
  version: 2;
  mediaCandidate: true;
  candidateRole: CandidateCommercialRole;
  commercialQueue: boolean;
  signalClass: CandidateCommercialSignalClass;
  reason: string;
  confidence: number;
  title: string;
  discoveryLane: string | null;
  fundingInstrument: string | null;
  fundingAmount: {
    currency: 'BRL' | 'USD';
    amount: number;
    raw: string;
  } | null;
  explicitFundingNeed: boolean;
  explicitCreditExpansion: boolean;
  automaticDecisionEligible: false;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const firstText = (...values: unknown[]) => String(
  values.find((value) => typeof value === 'string' && value.trim()) ?? '',
).replace(/\s+/g, ' ').trim();

const normalizeText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9$]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const MEDIA_SOURCE_RE = /(?:^google-news-rss$|_rss$|rss$)/i;

const GENERIC_EDITORIAL_NAMES = new Set([
  'entrevista',
  'noticia',
  'noticias',
  'opiniao',
  'podcast',
  'especial',
  'exclusivo',
  'conteudo patrocinado',
  'publicidade',
  'publieditorial',
  'mercado',
  'setor',
  'credito',
  'fidc',
  'fidcs',
  'fintech',
  'fintechs',
  'startup',
  'startups',
  'antecipacao de recebiveis',
]);

const FUNDING_INSTRUMENTS: Array<[RegExp, string]> = [
  [/\bfidc\b/i, 'FIDC'],
  [/\bcota\s+senior\b/i, 'FIDC senior tranche'],
  [/\bdebentur(?:e|es)\b/i, 'Debenture'],
  [/\bnota\s+comercial\b/i, 'Nota comercial'],
  [/\bwarehouse\b/i, 'Warehouse'],
  [/\bemprestimo\b/i, 'Emprestimo'],
  [/\blinha\s+de\s+credito\b/i, 'Linha de credito'],
  [/\bfinanciamento\b/i, 'Financiamento'],
  [/\bdivida\b/i, 'Divida'],
  [/\bsecuritiza(?:cao|ção)\b/i, 'Securitizacao'],
  [/\bfunding\b/i, 'Funding'],
];

const DIRECT_FUNDING_ACTION = /\b(capta|captou|levanta|levantou|busca|obtem|obteve|recebe|recebeu|garante|garantiu|contrata|contratou|fecha|fechou|assegura|assegurou)\b/i;
const CREDIT_CONTEXT = /\b(credito|consignado|recebiveis|recebivel|antecipacao|fidc|financiamento|emprestimo|carteira|lending|securitizacao|duplicatas?)\b/i;
const CREDIT_EXPANSION_ACTION = /\b(compra|comprou|adquire|adquiriu|entra|entrar|expande|expandir|expansao|amplia|ampliar|lanca|lancou|cria|criou|mira|planeja|prepara|acelera|cresce|cresceu|fortalece|fortaleceu)\b/i;
const FUNDING_PLAN_CONTEXT = /\b(planos?|planeja|prepara|mira|estuda|considera|pretende|quer)\b/i;
const PLANNED_INSTRUMENT_CONTEXT = /(?:\b(?:fidc|debentures?|nota comercial|warehouse|funding|financiamento|emprestimo|divida|securitizacao)\b.{0,45}\b(?:nos? planos?|planeja|prepara|mira|estuda|considera|pretende|quer)\b|\b(?:nos? planos?|planeja|prepara|mira|estuda|considera|pretende|quer)\b.{0,45}\b(?:fidc|debentures?|nota comercial|warehouse|funding|financiamento|emprestimo|divida|securitizacao)\b)/i;
const INTERMEDIARY_ACTION = /\b(estrutura|estruturou|estruturação|estruturacao)\b/i;
const INTERMEDIARY_FOR_THIRD_PARTY = /\bpara\s+(?:o\s+|a\s+)?(?:banco|fintech|empresa|cliente|originador|cedente|companhia|grupo)\b/i;

const parseLocalizedNumber = (value: string) => {
  const compact = value.replace(/\s+/g, '');
  if (compact.includes(',') && compact.includes('.')) {
    return Number(compact.replace(/\./g, '').replace(',', '.'));
  }
  if (compact.includes(',')) return Number(compact.replace(',', '.'));
  return Number(compact);
};

export const extractFundingAmount = (text: string): CandidateCommercialSemantics['fundingAmount'] => {
  const match = text.match(/\b(R\$|US\$)\s*([0-9]+(?:[.,][0-9]+)?)\s*(bilh(?:ão|ões|ao|oes)|bi|milh(?:ão|ões|ao|oes)|mi|mil)?\b/i);
  if (!match) return null;
  const base = parseLocalizedNumber(match[2] ?? '');
  if (!Number.isFinite(base)) return null;
  const scaleRaw = String(match[3] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const scale = /bilh|^bi$/.test(scaleRaw)
    ? 1_000_000_000
    : /milh|^mi$/.test(scaleRaw)
      ? 1_000_000
      : scaleRaw === 'mil'
        ? 1_000
        : 1;
  return {
    currency: match[1]?.toUpperCase() === 'US$' ? 'USD' : 'BRL',
    amount: base * scale,
    raw: match[0],
  };
};

const fundingInstrument = (text: string) => {
  for (const [pattern, label] of FUNDING_INSTRUMENTS) {
    if (pattern.test(text)) return label;
  }
  return null;
};

const isMediaCandidate = (input: CandidateCommercialSemanticsInput) => {
  const raw = asRecord(input.rawPayload);
  const transportSourceRef = firstText(raw.transportSourceRef);
  return transportSourceRef === 'google-news-rss'
    || MEDIA_SOURCE_RE.test(input.sourceRef)
    || MEDIA_SOURCE_RE.test(transportSourceRef);
};

export const classifyCandidateCommercialSemantics = (
  input: CandidateCommercialSemanticsInput,
): CandidateCommercialSemantics | null => {
  if (!isMediaCandidate(input)) return null;

  const raw = asRecord(input.rawPayload);
  const latestObservation = asRecord(raw.latestObservation);
  const title = firstText(raw.title, latestObservation.evidenceSummary, input.evidenceSummary);
  const normalizedTitle = normalizeText(title);
  const normalizedName = normalizeText(input.companyName);
  const discoveryLane = firstText(raw.discoveryLane) || null;
  const amount = extractFundingAmount(title);
  const instrument = fundingInstrument(normalizedTitle);

  if (!normalizedName || GENERIC_EDITORIAL_NAMES.has(normalizedName)) {
    return {
      version: 2,
      mediaCandidate: true,
      candidateRole: 'non_entity',
      commercialQueue: false,
      signalClass: 'editorial_noise',
      reason: 'generic_editorial_subject_not_company',
      confidence: 0.99,
      title,
      discoveryLane,
      fundingInstrument: instrument,
      fundingAmount: amount,
      explicitFundingNeed: false,
      explicitCreditExpansion: false,
      automaticDecisionEligible: false,
    };
  }

  const intermediary = INTERMEDIARY_ACTION.test(normalizedTitle)
    && INTERMEDIARY_FOR_THIRD_PARTY.test(normalizedTitle)
    && Boolean(instrument || CREDIT_CONTEXT.test(normalizedTitle));

  if (intermediary) {
    return {
      version: 2,
      mediaCandidate: true,
      candidateRole: 'financial_intermediary',
      commercialQueue: false,
      signalClass: 'market_intermediary_activity',
      reason: 'explicit_structuring_for_third_party',
      confidence: 0.94,
      title,
      discoveryLane,
      fundingInstrument: instrument,
      fundingAmount: amount,
      explicitFundingNeed: false,
      explicitCreditExpansion: false,
      automaticDecisionEligible: false,
    };
  }

  const fundingPlan = Boolean(instrument)
    && FUNDING_PLAN_CONTEXT.test(normalizedTitle)
    && PLANNED_INSTRUMENT_CONTEXT.test(normalizedTitle)
    && CREDIT_CONTEXT.test(normalizedTitle);

  if (fundingPlan) {
    return {
      version: 2,
      mediaCandidate: true,
      candidateRole: 'operating_company',
      commercialQueue: true,
      signalClass: 'funding_plan_trigger',
      reason: 'explicit_credit_funding_plan_without_completed_raise',
      confidence: 0.86,
      title,
      discoveryLane,
      fundingInstrument: instrument,
      fundingAmount: amount,
      explicitFundingNeed: true,
      explicitCreditExpansion: true,
      automaticDecisionEligible: false,
    };
  }

  const directFunding = DIRECT_FUNDING_ACTION.test(normalizedTitle)
    && Boolean(instrument || (amount && CREDIT_CONTEXT.test(normalizedTitle)));

  if (directFunding) {
    return {
      version: 2,
      mediaCandidate: true,
      candidateRole: 'operating_company',
      commercialQueue: true,
      signalClass: 'direct_funding_trigger',
      reason: instrument ? 'explicit_funding_action_with_credit_instrument' : 'explicit_funding_action_amount_and_credit_context',
      confidence: instrument ? 0.97 : 0.92,
      title,
      discoveryLane,
      fundingInstrument: instrument,
      fundingAmount: amount,
      explicitFundingNeed: true,
      explicitCreditExpansion: CREDIT_CONTEXT.test(normalizedTitle),
      automaticDecisionEligible: false,
    };
  }

  const creditExpansion = CREDIT_CONTEXT.test(normalizedTitle)
    && CREDIT_EXPANSION_ACTION.test(normalizedTitle);

  if (creditExpansion) {
    return {
      version: 2,
      mediaCandidate: true,
      candidateRole: 'operating_company',
      commercialQueue: false,
      signalClass: 'credit_expansion_trigger',
      reason: 'explicit_credit_or_receivables_expansion_without_funding_need',
      confidence: 0.82,
      title,
      discoveryLane,
      fundingInstrument: instrument,
      fundingAmount: amount,
      explicitFundingNeed: false,
      explicitCreditExpansion: true,
      automaticDecisionEligible: false,
    };
  }

  return {
    version: 2,
    mediaCandidate: true,
    candidateRole: 'needs_classification',
    commercialQueue: false,
    signalClass: 'relevant_unclassified',
    reason: 'relevant_media_signal_without_explicit_direct_funding_semantics',
    confidence: 0.70,
    title,
    discoveryLane,
    fundingInstrument: instrument,
    fundingAmount: amount,
    explicitFundingNeed: false,
    explicitCreditExpansion: false,
    automaticDecisionEligible: false,
  };
};

export const applyCandidateCommercialSemantics = (
  input: CandidateCommercialSemanticsInput,
): Record<string, unknown> => {
  const semantics = classifyCandidateCommercialSemantics(input);
  const rawPayload = { ...(input.rawPayload ?? {}) };
  if (!semantics) return rawPayload;
  return {
    ...rawPayload,
    candidate_role: semantics.candidateRole,
    commercial_queue: semantics.commercialQueue,
    commercial_semantics_reason: semantics.reason,
    commercial_semantics_version: semantics.version,
    commercial_semantics: semantics,
  };
};
