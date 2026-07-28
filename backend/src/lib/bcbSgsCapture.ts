import { inferSourceCode } from './connectors.js';
import { fetchBcbSgsSeries, parseSeriesMetadata, type BcbSgsSeriesResult } from './bcbSgs.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

type SourceRuntimeConfig = {
  title: string;
  signalType: string;
  enrichmentType: string;
  provider: string;
  confidence: number;
  signalStrength: number;
};

const SGS_PORTAL_URL = 'https://dadosabertos.bcb.gov.br/dataset?groups=indicadores-economicos';
const CACHE_TTL_MS = 5 * 60 * 1_000;

const SOURCE_CONFIG: Record<string, SourceRuntimeConfig> = {
  src_bcb_sgs: {
    title: 'Indexadores macro BCB SGS',
    signalType: 'macro_indexer_context',
    enrichmentType: 'macro_credit_context',
    provider: 'Banco Central do Brasil (SGS)',
    confidence: 0.7,
    signalStrength: 48,
  },
  src_bcb_sgs_credit_series: {
    title: 'Ciclo de crédito BCB SGS',
    signalType: 'macro_credit_cycle',
    enrichmentType: 'credit_cycle_context',
    provider: 'Banco Central do Brasil (SGS Crédito)',
    confidence: 0.82,
    signalStrength: 62,
  },
};

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSources = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .filter((source) => Boolean(SOURCE_CONFIG[source.runtimeCode]));

// Macro and credit-cycle series are company-agnostic. The capture engine may
// fan out one task per company, so a short TTL cache keeps the provider cost at
// one request per series while preserving fresh data for later runs.
const seriesCache = new Map<string, { expiresAt: number; promise: Promise<BcbSgsSeriesResult[]> }>();

const fetchSeriesOnce = (source: RuntimeSource) => {
  const cacheKey = source.id;
  const cached = seriesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const series = parseSeriesMetadata(source.metadata?.series);
  const promise = Promise.all(series.map(async (config) => {
    try {
      return await fetchBcbSgsSeries(config);
    } catch {
      return { ...config, observations: [], latest: null } satisfies BcbSgsSeriesResult;
    }
  }));

  seriesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
  return promise;
};

const captureSource = async (
  company: CompanySeed,
  source: RuntimeSource,
  collectedAt: string,
): Promise<CaptureBundle> => {
  const config = SOURCE_CONFIG[source.runtimeCode];
  const results = await fetchSeriesOnce(source);
  const observed = results.filter((result) => result.latest);
  const status = observed.length ? 'real' : 'partial';
  const confidence = observed.length ? config.confidence : 0.38;
  const summary = observed.length
    ? observed.map((result) => `${result.name}: ${result.latest!.value}${result.unit ? ` ${result.unit}` : ''} (${result.latest!.date})`).join(' · ')
    : 'Séries SGS indisponíveis nesta execução; usando fallback parcial.';
  const sourceUrl = source.url ?? SGS_PORTAL_URL;

  return {
    outputs: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      title: config.title,
      summary,
      collectedAt,
      confidenceScore: confidence,
      connectorStatus: status,
      normalizedPayload: {
        series: results.map((result) => ({
          code: result.code,
          name: result.name,
          unit: result.unit,
          latest: result.latest,
          observations: result.observations,
        })),
        seriesObserved: observed.length,
        sourceUrl,
        timestamp: collectedAt,
        confidenceScore: confidence,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceCategory: source.category,
        cacheTtlMs: CACHE_TTL_MS,
      },
    }],
    signals: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      signalType: config.signalType,
      signalStrength: observed.length ? config.signalStrength : 30,
      confidenceScore: confidence,
      evidencePayload: {
        note: summary,
        provider: config.provider,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceUrl,
        seriesObserved: observed.length,
        timestamp: collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
    enrichments: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      enrichmentType: config.enrichmentType,
      provider: config.provider,
      payload: {
        sourceId: source.id,
        sourceCode: source.runtimeCode,
        sourceConfidence: confidence,
        series: results.map((result) => ({ code: result.code, name: result.name, unit: result.unit, latest: result.latest })),
        sourceUrl,
        collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
  };
};

export async function captureBcbSgsMacro(
  company: CompanySeed,
  sources: SourceCatalogEntry[],
  collectedAt: string,
): Promise<CaptureBundle> {
  const activeSources = findSources(sources);
  if (!activeSources.length) return emptyBundle();

  const bundles = await Promise.all(activeSources.map((source) => captureSource(company, source, collectedAt)));
  return bundles.reduce<CaptureBundle>((combined, bundle) => ({
    outputs: [...combined.outputs, ...bundle.outputs],
    signals: [...combined.signals, ...bundle.signals],
    enrichments: [...combined.enrichments, ...bundle.enrichments],
  }), emptyBundle());
}
