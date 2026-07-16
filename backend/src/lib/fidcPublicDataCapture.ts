import { inferSourceCode } from './connectors.js';
import { fetchCvmFidcInformeMensalPackage, type CVMOpenDataPackage } from './connectors/fidc/cvmOpenDataDatasets.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const DATASET_URL = 'https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal';

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === 'src_cvm_fidc_informe_mensal');

// The CVM dataset is company-agnostic; run the probe only for companies with a
// plausible FIDC/securitization angle to keep per-company noise low (same
// per-company precedent as src_cvm_rss).
export const isFidcRelevantCompany = (company: CompanySeed) =>
  /fidc|securit|warehouse/i.test(company.currentFundingStructure ?? '') || (company.receivables?.length ?? 0) > 0;

export async function captureFidcPublicData(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const source = findSource(sources);
  if (!source) return emptyBundle();
  if (!isFidcRelevantCompany(company)) return emptyBundle();

  let dataset: CVMOpenDataPackage | null = null;
  try {
    dataset = await fetchCvmFidcInformeMensalPackage();
  } catch {
    dataset = null;
  }

  const status = dataset ? 'real' : 'partial';
  const confidence = dataset ? 0.72 : 0.4;
  const summary = dataset
    ? `${dataset.title} · atualizado em ${dataset.metadataModified ?? 'data desconhecida'} · ${dataset.resources.length} recursos`
    : 'Dataset CVM FIDC indisponível nesta execução; usando fallback parcial.';

  return {
    outputs: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      title: 'CVM FIDC informe mensal · dataset',
      summary,
      collectedAt,
      confidenceScore: confidence,
      connectorStatus: status,
      normalizedPayload: {
        datasetId: dataset?.datasetId ?? 'fidc-doc-inf_mensal',
        datasetName: dataset?.datasetName ?? 'fidc-doc-inf_mensal',
        metadataModified: dataset?.metadataModified,
        resources: (dataset?.resources ?? []).slice(0, 12),
        sourceUrl: DATASET_URL,
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
      signalType: 'fidc_dataset_update_signal',
      signalStrength: dataset ? 62 : 35,
      confidenceScore: confidence,
      evidencePayload: {
        note: summary,
        provider: 'CVM Dados Abertos',
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceUrl: DATASET_URL,
        metadataModified: dataset?.metadataModified,
        timestamp: collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
    enrichments: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      enrichmentType: 'fidc_public_dataset_snapshot',
      provider: 'CVM Dados Abertos',
      payload: {
        sourceId: source.id,
        sourceCode: source.runtimeCode,
        sourceConfidence: confidence,
        dataset: dataset
          ? {
              datasetId: dataset.datasetId,
              title: dataset.title,
              metadataModified: dataset.metadataModified,
              resourceCount: dataset.resources.length,
            }
          : null,
        sourceUrl: DATASET_URL,
        collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
  };
}
