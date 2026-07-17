import { inferSourceCode } from './connectors.js';
import { searchPncpContracts, type PncpSearchResult } from './pncpContracts.js';
import { searchQueridoDiario, type GazetteSearchResult } from './queridoDiario.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[], runtimeCode: string) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === runtimeCode);

const cnpjDigits = (company: CompanySeed) => company.cnpj.replace(/\D/g, '');

const buildOutput = (
  company: CompanySeed,
  source: RuntimeSource,
  collectedAt: string,
  params: { title: string; summary: string; status: 'real' | 'partial'; confidence: number; sourceUrl: string; payload: Record<string, unknown> },
): MonitoringOutput => ({
  id: crypto.randomUUID(),
  companyId: company.id,
  sourceId: source.id,
  title: params.title,
  summary: params.summary,
  collectedAt,
  confidenceScore: params.confidence,
  connectorStatus: params.status,
  normalizedPayload: {
    ...params.payload,
    sourceUrl: params.sourceUrl,
    timestamp: collectedAt,
    confidenceScore: params.confidence,
    sourceCode: source.runtimeCode,
    sourceName: source.name,
    sourceCategory: source.category,
  },
});

// Regra do cérebro mestre: consulta vazia ou erro nunca vira sinal comercial —
// sinais só são emitidos quando a busca retorna evidência concreta.
const capturePncp = async (company: CompanySeed, source: RuntimeSource, collectedAt: string): Promise<CaptureBundle> => {
  let result: PncpSearchResult | null = null;
  try {
    result = await searchPncpContracts(cnpjDigits(company) || company.legalName);
  } catch {
    result = null;
  }

  const status = result ? 'real' : 'partial';
  const confidence = result ? (result.hits.length ? 0.78 : 0.6) : 0.4;
  const summary = result
    ? result.hits.length
      ? `${result.total} contrato(s) públicos encontrados no PNCP · ex.: ${result.hits[0]!.title}`
      : 'Nenhum contrato público encontrado no PNCP para o fornecedor.'
    : 'Consulta PNCP indisponível nesta execução.';

  const output = buildOutput(company, source, collectedAt, {
    title: `Contratos públicos PNCP · ${company.tradeName}`,
    summary,
    status,
    confidence,
    sourceUrl: 'https://pncp.gov.br/app/contratos',
    payload: { query: cnpjDigits(company) || company.legalName, total: result?.total ?? 0, hits: result?.hits ?? [] },
  });

  const signals: CompanySignal[] = result?.hits.length
    ? [{
        id: crypto.randomUUID(),
        companyId: company.id,
        sourceId: source.id,
        signalType: 'public_contract_receivables',
        signalStrength: 82,
        confidenceScore: confidence,
        evidencePayload: {
          note: summary,
          provider: 'PNCP (API oficial)',
          hits: result.hits.slice(0, 3),
          sourceCode: source.runtimeCode,
          sourceName: source.name,
          sourceUrl: result.hits[0]!.url,
          timestamp: collectedAt,
        },
        observedVsInferred: 'observed',
        createdAt: collectedAt,
      }]
    : [];

  const enrichments: EnrichmentRecord[] = result?.hits.length
    ? [{
        id: crypto.randomUUID(),
        companyId: company.id,
        enrichmentType: 'public_contract_footprint',
        provider: 'PNCP (API oficial)',
        payload: {
          sourceId: source.id,
          sourceCode: source.runtimeCode,
          sourceConfidence: confidence,
          totalContracts: result.total,
          topContracts: result.hits.slice(0, 3),
          collectedAt,
        },
        observedVsInferred: 'observed',
        createdAt: collectedAt,
      }]
    : [];

  return { outputs: [output], signals, enrichments };
};

const captureQueridoDiario = async (company: CompanySeed, source: RuntimeSource, collectedAt: string): Promise<CaptureBundle> => {
  let result: GazetteSearchResult | null = null;
  try {
    result = await searchQueridoDiario(company.legalName || company.tradeName);
  } catch {
    result = null;
  }

  const status = result ? 'real' : 'partial';
  const confidence = result ? (result.hits.length ? 0.72 : 0.58) : 0.4;
  const summary = result
    ? result.hits.length
      ? `${result.total} menção(ões) em diários oficiais municipais · última em ${result.hits[0]!.territoryName} (${result.hits[0]!.date})`
      : 'Nenhuma menção recente em diários oficiais municipais.'
    : 'Consulta Querido Diário indisponível nesta execução.';

  const output = buildOutput(company, source, collectedAt, {
    title: `Diários oficiais municipais · ${company.tradeName}`,
    summary,
    status,
    confidence,
    sourceUrl: 'https://queridodiario.ok.org.br',
    payload: { query: company.legalName || company.tradeName, total: result?.total ?? 0, hits: result?.hits ?? [] },
  });

  const signals: CompanySignal[] = result?.hits.length
    ? [{
        id: crypto.randomUUID(),
        companyId: company.id,
        sourceId: source.id,
        signalType: 'regulatory_event',
        signalStrength: 66,
        confidenceScore: confidence,
        evidencePayload: {
          note: summary,
          provider: 'Querido Diário (Open Knowledge Brasil)',
          excerpts: result.hits.flatMap((hit) => hit.excerpts).slice(0, 4),
          sourceCode: source.runtimeCode,
          sourceName: source.name,
          sourceUrl: result.hits[0]!.url,
          timestamp: collectedAt,
        },
        observedVsInferred: 'observed',
        createdAt: collectedAt,
      }]
    : [];

  const enrichments: EnrichmentRecord[] = result?.hits.length
    ? [{
        id: crypto.randomUUID(),
        companyId: company.id,
        enrichmentType: 'official_gazette_mentions',
        provider: 'Querido Diário (Open Knowledge Brasil)',
        payload: {
          sourceId: source.id,
          sourceCode: source.runtimeCode,
          sourceConfidence: confidence,
          totalMentions: result.total,
          recentMentions: result.hits,
          collectedAt,
        },
        observedVsInferred: 'observed',
        createdAt: collectedAt,
      }]
    : [];

  return { outputs: [output], signals, enrichments };
};

export async function capturePublicRecords(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const pncpSource = findSource(sources, 'src_pncp_contracts_api');
  const gazetteSource = findSource(sources, 'src_querido_diario_api');

  const tasks: Array<Promise<CaptureBundle>> = [];
  if (pncpSource && (cnpjDigits(company) || company.legalName)) tasks.push(capturePncp(company, pncpSource, collectedAt));
  if (gazetteSource && (company.legalName || company.tradeName)) tasks.push(captureQueridoDiario(company, gazetteSource, collectedAt));

  if (!tasks.length) return emptyBundle();

  const bundles = await Promise.all(tasks);
  return {
    outputs: bundles.flatMap((bundle) => bundle.outputs),
    signals: bundles.flatMap((bundle) => bundle.signals),
    enrichments: bundles.flatMap((bundle) => bundle.enrichments),
  };
}
