import { inferSourceCode } from './connectors.js';
import { fetchPortfolioPage, parsePortfoliosMetadata, type VcPortfolioPage } from './vcPortfolios.js';
import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type CaptureBundle = {
  outputs: MonitoringOutput[];
  signals: CompanySignal[];
  enrichments: EnrichmentRecord[];
};

const MIN_MATCH_NAME_LENGTH = 4;

const emptyBundle = (): CaptureBundle => ({ outputs: [], signals: [], enrichments: [] });

const runtimeSource = (source: SourceCatalogEntry): RuntimeSource => ({
  ...source,
  runtimeCode: inferSourceCode(source),
});

const findSource = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map(runtimeSource)
  .find((source) => source.runtimeCode === 'src_vc_portfolio_monitor');

const normalize = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Portfolio pages are company-agnostic; fetch them once per engine run.
let pagesCache: { key: string; promise: Promise<VcPortfolioPage[]> } | null = null;

const fetchPagesOnce = (source: RuntimeSource, collectedAt: string) => {
  if (pagesCache?.key !== collectedAt) {
    const portfolios = parsePortfoliosMetadata(source.metadata?.portfolios);
    pagesCache = {
      key: collectedAt,
      promise: Promise.all(portfolios.map((config) => fetchPortfolioPage(config)))
        .then((pages) => pages.filter((page): page is VcPortfolioPage => Boolean(page))),
    };
  }
  return pagesCache.promise;
};

// Falso positivo é pior que ausência de sinal (§24.1 do cérebro mestre):
// só nomes com >= 4 caracteres, casados por limite de palavra.
const companyMatchesPage = (company: CompanySeed, pageText: string) => {
  const normalizedPage = ` ${normalize(pageText)} `;
  const candidates = [company.tradeName, company.legalName]
    .map((name) => normalize(name ?? ''))
    .filter((name) => name.length >= MIN_MATCH_NAME_LENGTH);
  return candidates.some((name) => normalizedPage.includes(` ${name} `) || normalizedPage.includes(` ${name},`) || normalizedPage.includes(` ${name}.`));
};

export async function captureVcPortfolios(company: CompanySeed, sources: SourceCatalogEntry[], collectedAt: string): Promise<CaptureBundle> {
  const source = findSource(sources);
  if (!source) return emptyBundle();

  const pages = await fetchPagesOnce(source, collectedAt);
  const matches = pages.filter((page) => companyMatchesPage(company, page.text));
  // Sem match concreto não há evidência da empresa — nada é emitido; erro de
  // fetch tampouco vira sinal (as páginas ausentes já foram filtradas).
  if (!matches.length) return emptyBundle();

  const confidence = Math.min(0.86, 0.7 + matches.length * 0.05);
  const fundNames = matches.map((page) => page.fund);
  const summary = `Empresa presente em portfólio de VC: ${fundNames.join(', ')}`;

  return {
    outputs: matches.map((page) => ({
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      title: `Portfólio VC · ${page.fund}`,
      summary: `${company.tradeName} listada no portfólio público de ${page.fund}.`,
      collectedAt,
      confidenceScore: confidence,
      connectorStatus: 'real' as const,
      normalizedPayload: {
        fundName: page.fund,
        portfolioCompanyName: company.tradeName,
        evidenceUrl: page.url,
        sourceUrl: page.url,
        timestamp: collectedAt,
        confidenceScore: confidence,
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceCategory: source.category,
      },
    })),
    signals: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      sourceId: source.id,
      signalType: 'venture_backed',
      signalStrength: 74,
      confidenceScore: confidence,
      evidencePayload: {
        note: summary,
        provider: 'VC Portfolio Monitor Brasil',
        funds: fundNames,
        evidenceUrls: matches.map((page) => page.url),
        sourceCode: source.runtimeCode,
        sourceName: source.name,
        sourceUrl: matches[0]!.url,
        timestamp: collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
    enrichments: [{
      id: crypto.randomUUID(),
      companyId: company.id,
      enrichmentType: 'vc_portfolio_presence',
      provider: 'VC Portfolio Monitor Brasil',
      payload: {
        sourceId: source.id,
        sourceCode: source.runtimeCode,
        sourceConfidence: confidence,
        funds: matches.map((page) => ({ fund: page.fund, evidenceUrl: page.url })),
        collectedAt,
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    }],
  };
}
