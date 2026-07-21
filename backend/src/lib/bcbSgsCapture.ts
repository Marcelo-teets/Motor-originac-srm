import { inferSourceCode } from './connectors.js';
import { fetchBcbSgsSeries, parseSeriesMetadata, type BcbSgsSeriesResult } from './bcbSgs.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const SGS_PORTAL_URL = 'https://dadosabertos.bcb.gov.br/dataset?groups=indicadores-economicos';

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === 'src_bcb_sgs');

// The engine runs one capture per company in parallel; macro series are
// company-agnostic, so fetches are memoized per engine run (collectedAt key)
// to keep the cost at one request per series per run.
let seriesCache: { key: string; promise: Promise<BcbSgsSeriesResult[]> } | null = null;

const fetchSeriesOnce = (source: RuntimeSource, collectedAt: string) => {
  if (seriesCache?.key !== collectedAt) {
    const series = parseSeriesMetadata(source.metadata?.series);
    seriesCache = {
      key: collectedAt,
      promise: Promise.all(series.map(async (config) => {
        try {
          return await fetchBcbSgsSeries(config);
        } catch {
          return { ...config, observations: [], latest: null } satisfies BcbSgsSeriesResult;
        }
      })),
    };
  }
  return seriesCache.promise;
};

export async function captureBcbSgsMacro(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const source = findSource(sources);
  if (!source) return emptyBundle();

  const results = await fetchSeriesOnce(source, collectedAt);
  const observed = results.filter((result) => result.latest);
  const status = observed.length ? 'real' : 'partial';
  const confidence = observed.length ? 0.7 : 0.38;
  const summary = observed.length
    ? observed.map((result) => `${result.name}: ${result.latest!.value}${result.unit ? ` ${result.unit}` : ''} (${result.latest!.date})`).join(' · ')
    : 'Séries SGS indisponíveis nesta execução; usando fallback parcial.';

  return {
    outputs: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      title: 'Indexadores macro BCB SGS',
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
        sourceUrl: SGS_PORTAL_URL,
        timestamp: collectedAt,
        confidenceScore: confidence,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceCategory: source.category,
      },
    }],
    signals: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      signalType: 'macro_indexer_context',
      signalStrength: observed.length ? 48 : 30,
      confidenceScore: confidence,
      evidencePayload: {
        note: summary,
        provider: 'Banco Central do Brasil (SGS)',
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceUrl: SGS_PORTAL_URL,
        seriesObserved: observed.length,
        timestamp: collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
    enrichments: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      enrichmentType: 'macro_credit_context',
      provider: 'Banco Central do Brasil (SGS)',
      payload: {
        sourceId: source.id,
        sourceCode: source.runtimeCode,
        sourceConfidence: confidence,
        series: results.map((result) => ({ code: result.code, name: result.name, unit: result.unit, latest: result.latest })),
        sourceUrl: SGS_PORTAL_URL,
        collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
  };
}
