import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput } from '../../types/platform.js';
import type { CaptureEngineResult } from './types.js';

const stripDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalize = (value: string) => stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const normalizeIdentifier = (value: string) => value.trim().toLowerCase();
const digits = (value: string) => value.replace(/\D/g, '');
const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const stringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
  : [];

const COMPANY_BOUND_SOURCE_CODES = new Set([
  'src_company_website',
  'src_company_website_deep',
  'src_company_careers',
  'src_brasilapi_cnpj',
  'src_common_crawl_company_history',
  'src_wayback_company_history',
  'src_github_public_api',
  'src_pncp_contracts_api',
  'src_querido_diario_api',
  'src_vc_portfolio_monitor',
  'src_open_finance_participants_api',
  'src_bcb_pix_participants',
  'src_tech_signals_latam',
]);

const MARKET_CONTEXT_SOURCE_CODES = new Set([
  'src_bcb_sgs',
  'src_bcb_sgs_credit_series',
  'src_mais_retorno_api',
]);

const CROSS_THEME_PATTERNS: Record<string, RegExp> = {
  capital_structure: /fidc|capta|funding|debenture|capital|nota comercial|securitizacao|cri|cra/i,
  receivables_strength: /recebiveis|antecip|cartao|duplicata/i,
  expansion: /expans|crescimento|nova regi|novo canal|aquisicao/i,
  risk_signal: /inadimpl|provis|chargeback|risc|default|reestruturacao/i,
};

export type EntityRelevanceAssessment = {
  eligible: boolean;
  score: number;
  reason: string;
  sourceCode?: string;
  sourceCategory?: string;
  matchedEvidence: string[];
};

export type EntityRelevanceGateDiagnostics = {
  outputsBefore: number;
  outputsAfter: number;
  signalsBefore: number;
  signalsAfter: number;
  enrichmentsBefore: number;
  enrichmentsAfter: number;
  blockedOutputs: number;
  blockedSignals: number;
  blockedEnrichments: number;
  blockedReasons: Record<string, number>;
};

const sourceCodeFor = (output: MonitoringOutput) => normalizeIdentifier(stringValue(output.normalizedPayload?.sourceCode) ?? '');
const sourceCategoryFor = (output: MonitoringOutput) => normalize(stringValue(output.normalizedPayload?.sourceCategory) ?? '');

const hostname = (value?: string) => {
  if (!value) return undefined;
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]?.toLowerCase();
  }
};

const sourceUrlFor = (output: MonitoringOutput) => stringValue(
  output.normalizedPayload?.sourceUrl ?? output.normalizedPayload?.canonicalUrl ?? output.normalizedPayload?.endpoint,
);

const companyAliases = (company: CompanySeed) => {
  const candidates = [company.tradeName, company.legalName]
    .map((value) => normalize(value ?? ''))
    .filter((value) => value.length >= 3);
  return [...new Set(candidates)];
};

const hasPhrase = (text: string, phrase: string) => {
  if (!phrase) return false;
  const normalizedText = ` ${normalize(text)} `;
  const normalizedPhrase = ` ${normalize(phrase)} `;
  return normalizedPhrase.length > 4 && normalizedText.includes(normalizedPhrase);
};

const textMatchesCompany = (company: CompanySeed, text: string) => {
  const companyCnpj = digits(company.cnpj ?? '');
  if (companyCnpj.length === 14 && digits(text).includes(companyCnpj)) return true;
  return companyAliases(company).some((alias) => hasPhrase(text, alias));
};

const itemTexts = (output: MonitoringOutput) => {
  const items = output.normalizedPayload?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const text = [record.title, record.description, record.summary, record.content]
      .map((value) => stringValue(value))
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();
    return text ? [text] : [];
  });
};

const isStrictAggregator = (sourceCode: string, sourceCategory: string, output: MonitoringOutput) => {
  if (sourceCode.endsWith('_rss')) return true;
  if (sourceCategory.includes('news') || sourceCategory.includes('vc portfolio')) return true;
  return itemTexts(output).length > 0 && sourceUrlFor(output)?.includes('news.google.com') === true;
};

const isMarketContext = (sourceCode: string, sourceCategory: string) =>
  MARKET_CONTEXT_SOURCE_CODES.has(sourceCode) || sourceCategory.includes('macro context');

const isFirstParty = (company: CompanySeed, output: MonitoringOutput) => {
  const companyHost = hostname(company.website);
  const sourceHost = hostname(sourceUrlFor(output));
  return Boolean(companyHost && sourceHost && (companyHost === sourceHost || sourceHost.endsWith(`.${companyHost}`)));
};

export const assessOutputEntityRelevance = (company: CompanySeed, output: MonitoringOutput): EntityRelevanceAssessment => {
  const sourceCode = sourceCodeFor(output);
  const sourceCategory = sourceCategoryFor(output);

  if (isMarketContext(sourceCode, sourceCategory)) {
    return { eligible: false, score: 0, reason: 'market_context_not_company_evidence', sourceCode, sourceCategory, matchedEvidence: [] };
  }

  if (COMPANY_BOUND_SOURCE_CODES.has(sourceCode) || isFirstParty(company, output)) {
    return { eligible: true, score: 100, reason: 'company_bound_source', sourceCode, sourceCategory, matchedEvidence: [output.summary] };
  }

  const items = itemTexts(output);
  if (isStrictAggregator(sourceCode, sourceCategory, output)) {
    const matchedEvidence = items.filter((text) => textMatchesCompany(company, text));
    if (matchedEvidence.length) {
      return { eligible: true, score: 95, reason: 'explicit_entity_item_match', sourceCode, sourceCategory, matchedEvidence };
    }
    return { eligible: false, score: 0, reason: 'aggregator_entity_mismatch', sourceCode, sourceCategory, matchedEvidence: [] };
  }

  if (textMatchesCompany(company, output.summary)) {
    return { eligible: true, score: 85, reason: 'explicit_entity_summary_match', sourceCode, sourceCategory, matchedEvidence: [output.summary] };
  }

  return { eligible: false, score: 0, reason: 'entity_not_established', sourceCode, sourceCategory, matchedEvidence: [] };
};

const outputIdsFromSignal = (signal: CompanySignal) => {
  const exact = stringValue(signal.evidencePayload?.outputId);
  const many = stringArray(signal.evidencePayload?.outputIds);
  return [...new Set([...(exact ? [exact] : []), ...many])];
};

const outputIdsFromEnrichment = (enrichment: EnrichmentRecord) => {
  const direct = stringArray(enrichment.payload?.outputIds);
  const nested = Array.isArray(enrichment.payload?.outputs)
    ? enrichment.payload.outputs.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const outputId = stringValue((item as Record<string, unknown>).outputId);
        return outputId ? [outputId] : [];
      })
    : [];
  return [...new Set([...direct, ...nested])];
};

const signalText = (signal: CompanySignal) => [
  signal.evidencePayload?.note,
  signal.evidencePayload?.summary,
  signal.evidencePayload?.title,
].map((value) => stringValue(value)).filter((value): value is string => Boolean(value)).join(' ');

const signalEligible = (
  company: CompanySeed,
  signal: CompanySignal,
  outputsById: Map<string, MonitoringOutput>,
  assessmentById: Map<string, EntityRelevanceAssessment>,
) => {
  const referencedIds = outputIdsFromSignal(signal);
  const sourceOutputs = signal.sourceId
    ? [...outputsById.values()].filter((output) => output.sourceId === signal.sourceId)
    : [];
  const candidateOutputs = referencedIds.length
    ? referencedIds.map((id) => outputsById.get(id)).filter((item): item is MonitoringOutput => Boolean(item))
    : sourceOutputs;

  if (candidateOutputs.length && candidateOutputs.some((output) => !assessmentById.get(output.id)?.eligible)) return false;

  const strictOutputs = candidateOutputs.filter((output) => {
    const assessment = assessmentById.get(output.id);
    return assessment && isStrictAggregator(assessment.sourceCode ?? '', assessment.sourceCategory ?? '', output);
  });

  if (strictOutputs.length) {
    const treatmentVersion = stringValue(signal.evidencePayload?.treatmentVersion);
    if (!treatmentVersion) return textMatchesCompany(company, signalText(signal));

    const relevantEvidence = strictOutputs.flatMap((output) => assessmentById.get(output.id)?.matchedEvidence ?? []).join(' ');
    const keywords = stringArray(signal.evidencePayload?.keywords);
    return keywords.length > 0 && keywords.some((keyword) => hasPhrase(relevantEvidence, keyword));
  }

  if (!signal.sourceId && referencedIds.length) {
    const relevantEvidence = candidateOutputs.flatMap((output) => assessmentById.get(output.id)?.matchedEvidence ?? [output.summary]).join(' ');
    const theme = stringValue(signal.evidencePayload?.theme);
    const themePattern = theme ? CROSS_THEME_PATTERNS[theme] : undefined;
    return themePattern ? themePattern.test(normalize(relevantEvidence)) : true;
  }

  return candidateOutputs.length > 0 || textMatchesCompany(company, signalText(signal));
};

const enrichmentEligible = (
  enrichment: EnrichmentRecord,
  outputsById: Map<string, MonitoringOutput>,
  assessmentById: Map<string, EntityRelevanceAssessment>,
) => {
  const outputIds = outputIdsFromEnrichment(enrichment);
  if (!outputIds.length) return true;
  const referenced = outputIds.map((id) => outputsById.get(id)).filter((item): item is MonitoringOutput => Boolean(item));
  if (!referenced.length || referenced.some((output) => !assessmentById.get(output.id)?.eligible)) return false;

  if (enrichment.enrichmentType === 'capture_treatment_profile_v2' && referenced.some((output) => {
    const assessment = assessmentById.get(output.id);
    return assessment && isStrictAggregator(assessment.sourceCode ?? '', assessment.sourceCategory ?? '', output);
  })) return false;

  if (enrichment.enrichmentType === 'cross_source_corroboration') {
    const themes = stringArray(enrichment.payload?.themes);
    const relevantEvidence = referenced.flatMap((output) => assessmentById.get(output.id)?.matchedEvidence ?? [output.summary]).join(' ');
    return themes.every((theme) => CROSS_THEME_PATTERNS[theme]?.test(normalize(relevantEvidence)) ?? false);
  }

  return true;
};

export const filterCaptureResultsForEntityRelevance = (
  results: CaptureEngineResult[],
  companies: CompanySeed[],
): { results: CaptureEngineResult[]; diagnostics: EntityRelevanceGateDiagnostics } => {
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const blockedReasons: Record<string, number> = {};
  let outputsBefore = 0;
  let outputsAfter = 0;
  let signalsBefore = 0;
  let signalsAfter = 0;
  let enrichmentsBefore = 0;
  let enrichmentsAfter = 0;

  const filtered = results.map((result) => {
    const companyId = result.run.companyId;
    const company = companyId ? companyById.get(companyId) : undefined;
    outputsBefore += result.outputs.length;
    signalsBefore += result.signals.length;
    enrichmentsBefore += result.enrichments.length;

    if (!company) {
      result.outputs.forEach(() => { blockedReasons.company_not_found = (blockedReasons.company_not_found ?? 0) + 1; });
      return { ...result, outputs: [], documents: [], treatmentResults: [], signals: [], enrichments: [] };
    }

    const outputsById = new Map(result.outputs.map((output) => [output.id, output]));
    const assessmentById = new Map(result.outputs.map((output) => [output.id, assessOutputEntityRelevance(company, output)]));
    assessmentById.forEach((assessment) => {
      if (!assessment.eligible) blockedReasons[assessment.reason] = (blockedReasons[assessment.reason] ?? 0) + 1;
    });

    const outputs = result.outputs.filter((output) => assessmentById.get(output.id)?.eligible);
    const eligibleIds = new Set(outputs.map((output) => output.id));
    const documents = result.documents.filter((document) => document.monitoringOutputId && eligibleIds.has(document.monitoringOutputId));
    const treatmentResults = result.treatmentResults.filter((treatment) => eligibleIds.has(treatment.outputId));
    const signals = result.signals.filter((signal) => signalEligible(company, signal, outputsById, assessmentById));
    const enrichments = result.enrichments.filter((enrichment) => enrichmentEligible(enrichment, outputsById, assessmentById));

    outputsAfter += outputs.length;
    signalsAfter += signals.length;
    enrichmentsAfter += enrichments.length;

    return {
      ...result,
      run: {
        ...result.run,
        outputsWritten: outputs.length,
        signalsWritten: signals.length,
        enrichmentsWritten: enrichments.length,
      },
      outputs,
      documents,
      treatmentResults,
      signals,
      enrichments,
    };
  });

  return {
    results: filtered,
    diagnostics: {
      outputsBefore,
      outputsAfter,
      signalsBefore,
      signalsAfter,
      enrichmentsBefore,
      enrichmentsAfter,
      blockedOutputs: outputsBefore - outputsAfter,
      blockedSignals: signalsBefore - signalsAfter,
      blockedEnrichments: enrichmentsBefore - enrichmentsAfter,
      blockedReasons,
    },
  };
};
