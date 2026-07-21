import { inferSourceCode } from '../connectors.js';
import { scrapeCompanyWebsiteDeep } from './companyWebsiteDeepScraper.js';
import { scrapeProfessionalNetworkCompany } from './professionalNetworkCompanyScraper.js';
import type { B2BSignalPackResult, DetectedSignal } from './originationScraperTypes.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const MAX_SIGNAL_TYPES_PER_SOURCE = 8;

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[], runtimeCode: string) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === runtimeCode);

// The deep scraper can emit the same family once per visited page; keep the
// strongest occurrence per type and cap the total families persisted per run.
const aggregateSignals = (signals: DetectedSignal[]): DetectedSignal[] => {
  const byType = new Map<string, DetectedSignal>();
  for (const signal of signals) {
    const current = byType.get(signal.type);
    if (!current) {
      byType.set(signal.type, { ...signal, matchedKeywords: [...signal.matchedKeywords], evidence: [...signal.evidence] });
      continue;
    }
    const strongest = signal.strength > current.strength ? signal : current;
    byType.set(signal.type, {
      ...strongest,
      matchedKeywords: [...new Set([...current.matchedKeywords, ...signal.matchedKeywords])],
      evidence: [...new Set([...current.evidence, ...signal.evidence])].slice(0, 3),
    });
  }
  return [...byType.values()]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_SIGNAL_TYPES_PER_SOURCE);
};

const bundleFromRun = (
  company: CompanySeed,
  source: RuntimeSource,
  run: B2BSignalPackResult,
  collectedAt: string,
  labels: { title: string; enrichmentType: string; sourceUrl: string },
): CaptureBundle => {
  const aggregated = aggregateSignals(run.signals);
  const confidence = run.connectorStatus === 'real'
    ? (source.runtimeCode === 'src_company_website_deep' ? 0.81 : 0.76)
    : 0.45;
  const summary = aggregated.length
    ? `Sinais detectados: ${aggregated.map((signal) => signal.type).join(', ')}`
    : run.consolidatedText.slice(0, 180) || 'Sem sinais B2B detectados nesta execução.';

  const outputs: MonitoringOutput[] = [{
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId: source.id,
    title: `${labels.title} · ${company.tradeName}`,
    summary,
    collectedAt,
    confidenceScore: confidence,
    connectorStatus: run.connectorStatus,
    normalizedPayload: {
      pagesVisited: run.pages.length,
      pageTypes: run.pages.map((page) => page.pageType),
      signalCount: aggregated.length,
      metadata: run.metadata,
      sourceUrl: labels.sourceUrl,
      timestamp: collectedAt,
      confidenceScore: confidence,
      sourceCode: source.runtimeCode,
      sourceName: source.name,
      sourceCategory: source.category,
    },
  }];

  const signals: CompanySignal[] = aggregated.map((signal) => ({
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId: source.id,
    signalType: signal.type,
    signalStrength: signal.strength,
    confidenceScore: signal.confidenceScore,
    evidencePayload: {
      note: signal.evidence.join(' | ') || `Palavras-chave: ${signal.matchedKeywords.join(', ')}`,
      matchedKeywords: signal.matchedKeywords,
      evidence: signal.evidence,
      sourceUrl: signal.sourceUrl,
      sourceType: signal.sourceType,
      sourceCode: source.runtimeCode,
      sourceName: source.name,
      timestamp: collectedAt,
    },
    observedVsInferred: 'observed',
    createdAt: collectedAt,
  }));

  const enrichments: EnrichmentRecord[] = aggregated.length
    ? [{
        id: crypto.randomUUID(),
        companyId: company.id,
        enrichmentType: labels.enrichmentType,
        provider: 'origination_scrapers',
        payload: {
          sourceId: source.id,
          sourceCode: source.runtimeCode,
          sourceConfidence: confidence,
          topSignals: aggregated.map((signal) => ({
            type: signal.type,
            strength: signal.strength,
            matchedKeywords: signal.matchedKeywords,
          })),
          metadata: run.metadata,
          sourceUrl: labels.sourceUrl,
          collectedAt,
        },
        observedVsInferred: 'observed',
        createdAt: collectedAt,
      }]
    : [];

  return { outputs, signals, enrichments };
};

const mergeBundles = (bundles: CaptureBundle[]): CaptureBundle => ({
  outputs: bundles.flatMap((bundle) => bundle.outputs),
  signals: bundles.flatMap((bundle) => bundle.signals),
  enrichments: bundles.flatMap((bundle) => bundle.enrichments),
});

export async function captureOriginationScrapers(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const websiteDeepSource = findSource(sources, 'src_company_website_deep');
  const professionalNetworkSource = findSource(sources, 'src_professional_network_company');

  const tasks: Array<Promise<CaptureBundle>> = [];

  if (websiteDeepSource && company.website) {
    tasks.push(
      scrapeCompanyWebsiteDeep({ companyId: company.id, companyName: company.tradeName, website: company.website })
        .then((run) => bundleFromRun(company, websiteDeepSource, run, collectedAt, {
          title: 'Website deep scrape',
          enrichmentType: 'company_website_b2b_signal_pack',
          sourceUrl: String(run.metadata.baseUrl ?? company.website),
        })),
    );
  }

  if (professionalNetworkSource) {
    const baseUrl = typeof professionalNetworkSource.metadata?.baseUrl === 'string' ? professionalNetworkSource.metadata.baseUrl : undefined;
    tasks.push(
      scrapeProfessionalNetworkCompany({ companyId: company.id, companyName: company.tradeName, baseUrl })
        .then((run) => bundleFromRun(company, professionalNetworkSource, run, collectedAt, {
          title: 'Professional network profile',
          enrichmentType: 'professional_network_signal_pack',
          sourceUrl: String(run.metadata.requestedUrl ?? baseUrl ?? 'https://www.linkedin.com'),
        })),
    );
  }

  if (!tasks.length) return emptyBundle();

  return mergeBundles(await Promise.all(tasks));
}
