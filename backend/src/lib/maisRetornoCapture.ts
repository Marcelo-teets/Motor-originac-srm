import { inferSourceCode } from './connectors.js';
import { fetchMaisRetornoMarketData } from './maisRetorno.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === 'src_mais_retorno_api');

export async function captureMaisRetorno(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const source = findSource(sources);
  if (!source) return { outputs: [], signals: [], enrichments: [] };

  const result = await fetchMaisRetornoMarketData(company, source);
  if (!result) return { outputs: [], signals: [], enrichments: [] };

  const confidence = result.status === 'real' ? 0.68 : 0.44;

  return {
    outputs: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      title: result.title,
      summary: result.summary,
      collectedAt,
      confidenceScore: confidence,
      connectorStatus: result.status,
      normalizedPayload: {
        ...result.payload,
        sourceUrl: result.sourceUrl,
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
      signalType: 'market_data_signal',
      signalStrength: result.status === 'real' ? 58 : 35,
      confidenceScore: confidence,
      evidencePayload: {
        note: result.summary,
        provider: 'Mais Retorno',
        source: source.id,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceUrl: result.sourceUrl,
        quota: result.quota,
        timestamp: collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
    enrichments: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      enrichmentType: 'mais_retorno_market_data',
      provider: 'Mais Retorno',
      payload: {
        sourceConfidence: confidence,
        sourceId: source.id,
        sourceCode: source.runtimeCode,
        sourceNotes: ['Fonte auxiliar de dados de mercado e comparáveis.'],
        maisRetorno: result.payload,
        quota: result.quota,
        sourceUrl: result.sourceUrl,
        collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
  };
}
