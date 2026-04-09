import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';
import { fetchBrasilApiCompany, fetchRssFeed, monitorCompanyWebsite } from './connectors.js';
import { scrapeCompanyWebsiteDeep } from './scrapers/companyWebsiteDeepScraper.js';
import { scrapeProfessionalNetworkCompany } from './scrapers/professionalNetworkCompanyScraper.js';
import type { DetectedSignal } from './scrapers/originationScraperTypes.js';

const nowIso = () => new Date().toISOString();
const toConfidence = (status: 'real' | 'partial') => (status === 'real' ? 0.82 : 0.45);

const connectorMetadata = (sourceUrl: string, collectedAt: string, confidenceScore: number) => ({
  sourceUrl,
  collectedAt,
  timestamp: collectedAt,
  confidenceScore,
});

const deriveSignalType = (text: string) => {
  const value = text.toLowerCase();
  if (/expans|nova regi|novo canal|crescimento/.test(value)) return 'expansion_signal';
  if (/fidc|funding|capital|deb[êe]nture|capta/.test(value)) return 'capital_mismatch';
  if (/receb[ií]veis|cart[ãa]o|antecip/.test(value)) return 'receivables_strong';
  if (/embedded|wallet|pix|checkout|pagamento/.test(value)) return 'embedded_finance';
  if (/contrata|vaga|risk|cobran|underwriting/.test(value)) return 'growth_without_funding';
  return 'market_signal';
};

const signalStrengthFromText = (text: string) => {
  const value = text.toLowerCase();
  if (/expans|funding|capital|receb[ií]veis|embedded|contrata/.test(value)) return 78;
  return 62;
};

const buildSignal = (
  company: CompanySeed,
  sourceId: string,
  idSuffix: string,
  text: string,
  collectedAt: string,
  status: 'real' | 'partial',
  sourceUrl: string,
): CompanySignal => ({
  id: `${company.id}_${sourceId}_${idSuffix}`,
  companyId: company.id,
  sourceId,
  signalType: deriveSignalType(text),
  signalStrength: signalStrengthFromText(text),
  confidenceScore: toConfidence(status),
  evidencePayload: { note: text, source: sourceId, sourceUrl, timestamp: collectedAt, confidenceScore: toConfidence(status) },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

const buildDetectedSignal = (
  company: CompanySeed,
  sourceId: string,
  index: number,
  signal: DetectedSignal,
  collectedAt: string,
): CompanySignal => ({
  id: `${company.id}_${sourceId}_detected_${index + 1}`,
  companyId: company.id,
  sourceId,
  signalType: signal.type,
  signalStrength: signal.strength,
  confidenceScore: signal.confidenceScore,
  evidencePayload: {
    matchedKeywords: signal.matchedKeywords,
    evidence: signal.evidence,
    sourceUrl: signal.sourceUrl,
    sourceType: signal.sourceType,
    timestamp: collectedAt,
  },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

const buildMonitoringOutput = (
  company: CompanySeed,
  sourceId: string,
  title: string,
  summary: string,
  collectedAt: string,
  connectorStatus: 'real' | 'partial',
  normalizedPayload: Record<string, unknown>,
): MonitoringOutput => ({
  id: `${company.id}_${sourceId}`,
  companyId: company.id,
  sourceId,
  title,
  summary,
  collectedAt,
  confidenceScore: connectorStatus === 'real' ? 0.78 : 0.46,
  connectorStatus,
  normalizedPayload,
});

const buildBrasilApiEnrichment = (company: CompanySeed, payload: Record<string, any>, collectedAt: string, sourceUrl: string): EnrichmentRecord => ({
  id: `${company.id}_enrichment_brasilapi`,
  companyId: company.id,
  enrichmentType: 'brasilapi_cnpj',
  provider: 'BrasilAPI',
  payload: {
    governanceMaturity: payload.porte ? 'medium_high' : company.enrichment.governanceMaturity,
    underwritingMaturity: company.enrichment.underwritingMaturity,
    operationalMaturity: company.enrichment.operationalMaturity,
    riskModelMaturity: company.enrichment.riskModelMaturity,
    unitEconomicsQuality: company.enrichment.unitEconomicsQuality,
    spreadVsFundingQuality: company.enrichment.spreadVsFundingQuality,
    concentrationRisk: company.enrichment.concentrationRisk,
    delinquencySignal: company.enrichment.delinquencySignal,
    sourceConfidence: payload.fallback ? 0.52 : 0.84,
    sourceNotes: [
      `CNPJ consultado via BrasilAPI (${payload.razao_social ?? company.tradeName}).`,
      payload.capital_social ? `Capital social público: ${payload.capital_social}.` : 'Capital social não disponível publicamente.',
    ],
    brasilApi: payload,
    sourceUrl,
    collectedAt,
  },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

export async function ingestCompanyMonitoringHighSignal(company: CompanySeed, sources: SourceCatalogEntry[]) {
  const collectedAt = nowIso();
  const rssSources = [
    { id: 'src_google_news_rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(company.tradeName)}` },
    { id: 'src_cvm_rss', url: 'https://www.gov.br/cvm/pt-br/assuntos/noticias/rss' },
  ].filter((source) => sources.some((item) => item.id === source.id));

  const shouldRunDeepWebsite = sources.some((item) => item.id === 'src_company_website_deep');
  const shouldRunProfessionalNetwork = sources.some((item) => item.id === 'src_professional_network_company');

  const [website, brasilApi, websiteDeepRun, professionalNetworkRun, ...rssResults] = await Promise.all([
    monitorCompanyWebsite(company.website),
    fetchBrasilApiCompany(company.cnpj),
    shouldRunDeepWebsite
      ? scrapeCompanyWebsiteDeep({ companyId: company.id, companyName: company.tradeName, website: company.website })
      : Promise.resolve(null),
    shouldRunProfessionalNetwork
      ? scrapeProfessionalNetworkCompany({ companyId: company.id, companyName: company.tradeName })
      : Promise.resolve(null),
    ...rssSources.map((source) => fetchRssFeed(source.url)),
  ]);

  const outputs: MonitoringOutput[] = [
    {
      id: `${company.id}_website`,
      companyId: company.id,
      sourceId: 'src_company_website',
      title: `Website monitor · ${website.title}`,
      summary: website.headings.join(' | ') || website.bodyText.slice(0, 180) || 'Sem conteúdo capturado.',
      collectedAt,
      confidenceScore: website.status === 'real' ? 0.74 : 0.42,
      connectorStatus: website.status,
      normalizedPayload: {
        ...website,
        ...connectorMetadata(website.sourceUrl, collectedAt, website.status === 'real' ? 0.74 : 0.42),
      },
    },
    {
      id: `${company.id}_brasilapi`,
      companyId: company.id,
      sourceId: 'src_brasilapi_cnpj',
      title: `BrasilAPI CNPJ · ${company.tradeName}`,
      summary: brasilApi.data.razao_social ? `${brasilApi.data.razao_social} · ${brasilApi.data.descricao_situacao_cadastral ?? 'situação consultada'}` : `Consulta ${brasilApi.status} para ${company.cnpj}`,
      collectedAt,
      confidenceScore: brasilApi.status === 'real' ? 0.88 : 0.5,
      connectorStatus: brasilApi.status,
      normalizedPayload: {
        payload: brasilApi.data as Record<string, unknown>,
        endpoint: brasilApi.endpoint,
        ...connectorMetadata(brasilApi.endpoint, collectedAt, brasilApi.status === 'real' ? 0.88 : 0.5),
      },
    },
    ...rssResults.map((rss, index) => ({
      id: `${company.id}_${rssSources[index].id}`,
      companyId: company.id,
      sourceId: rssSources[index].id,
      title: `${rssSources[index].id} · ${company.tradeName}`,
      summary: rss.items.map((item) => item.title).join(' | '),
      collectedAt,
      confidenceScore: rss.status === 'real' ? 0.7 : 0.4,
      connectorStatus: rss.status,
      normalizedPayload: {
        items: rss.items,
        ...connectorMetadata(rss.sourceUrl, collectedAt, rss.status === 'real' ? 0.7 : 0.4),
      },
    })),
  ];

  if (websiteDeepRun) {
    outputs.push(buildMonitoringOutput(
      company,
      'src_company_website_deep',
      `Website deep scrape · ${company.tradeName}`,
      websiteDeepRun.signals.slice(0, 4).map((signal) => signal.type).join(' | ') || websiteDeepRun.consolidatedText.slice(0, 180) || 'Sem sinais relevantes.',
      collectedAt,
      websiteDeepRun.connectorStatus,
      {
        pages: websiteDeepRun.pages,
        signalCount: websiteDeepRun.signals.length,
        metadata: websiteDeepRun.metadata,
        ...connectorMetadata(company.website, collectedAt, websiteDeepRun.connectorStatus === 'real' ? 0.81 : 0.47),
      },
    ));
  }

  if (professionalNetworkRun) {
    outputs.push(buildMonitoringOutput(
      company,
      'src_professional_network_company',
      `Professional network company profile · ${company.tradeName}`,
      professionalNetworkRun.signals.slice(0, 4).map((signal) => signal.type).join(' | ') || professionalNetworkRun.consolidatedText.slice(0, 180) || 'Sem sinais relevantes.',
      collectedAt,
      professionalNetworkRun.connectorStatus,
      {
        pages: professionalNetworkRun.pages,
        signalCount: professionalNetworkRun.signals.length,
        metadata: professionalNetworkRun.metadata,
        ...connectorMetadata(String(professionalNetworkRun.metadata.requestedUrl ?? ''), collectedAt, professionalNetworkRun.connectorStatus === 'real' ? 0.76 : 0.44),
      },
    ));
  }

  const signals: CompanySignal[] = [
    buildSignal(company, 'src_company_website', 'website', website.headings.join(' | ') || website.bodyText || `Website update ${company.tradeName}`, collectedAt, website.status, website.sourceUrl),
    buildSignal(company, 'src_brasilapi_cnpj', 'brasilapi', brasilApi.data.porte ? `${brasilApi.data.porte} ${brasilApi.data.cnae_fiscal_descricao ?? ''}` : `Consulta cadastral ${company.tradeName}`, collectedAt, brasilApi.status, brasilApi.endpoint),
    ...rssResults.flatMap((rss, index) => rss.items.slice(0, 2).map((item, itemIndex) => buildSignal(company, rssSources[index].id, `rss_${itemIndex + 1}`, `${item.title}. ${item.description}`.trim(), collectedAt, rss.status, item.link || rss.sourceUrl))),
    ...(websiteDeepRun ? websiteDeepRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_company_website_deep', index, signal, collectedAt)) : []),
    ...(professionalNetworkRun ? professionalNetworkRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_professional_network_company', index, signal, collectedAt)) : []),
  ];

  const enrichments: EnrichmentRecord[] = [buildBrasilApiEnrichment(company, brasilApi.data as Record<string, any>, collectedAt, brasilApi.endpoint)];

  if (websiteDeepRun?.signals.length) {
    enrichments.push({
      id: `${company.id}_enrichment_company_website_deep`,
      companyId: company.id,
      enrichmentType: 'company_website_b2b_signal_pack',
      provider: 'company_website_deep_scraper',
      payload: {
        sourceConfidence: websiteDeepRun.connectorStatus === 'real' ? 0.81 : 0.47,
        sourceNotes: websiteDeepRun.signals.slice(0, 5).map((signal) => `${signal.type}: ${signal.matchedKeywords.join(', ')}`),
        metadata: websiteDeepRun.metadata,
        topSignals: websiteDeepRun.signals.slice(0, 10),
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    });
  }

  if (professionalNetworkRun?.signals.length) {
    enrichments.push({
      id: `${company.id}_enrichment_professional_network_profile`,
      companyId: company.id,
      enrichmentType: 'professional_network_signal_pack',
      provider: 'professional_network_company_scraper',
      payload: {
        sourceConfidence: professionalNetworkRun.connectorStatus === 'real' ? 0.76 : 0.44,
        sourceNotes: professionalNetworkRun.signals.slice(0, 5).map((signal) => `${signal.type}: ${signal.matchedKeywords.join(', ')}`),
        metadata: professionalNetworkRun.metadata,
        topSignals: professionalNetworkRun.signals.slice(0, 10),
      },
      observedVsInferred: 'observed',
      createdAt: collectedAt,
    });
  }

  return { outputs, signals, enrichments };
}
