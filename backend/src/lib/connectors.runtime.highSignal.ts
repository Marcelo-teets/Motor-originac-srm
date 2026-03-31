import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';
import { scrapeCompanyWebsiteDeep } from './scrapers/companyWebsiteDeepScraper.js';
import { scrapeProfessionalNetworkCompany } from './scrapers/professionalNetworkCompanyScraper.js';
import { scrapeCompanyNewsroom } from './scrapers/companyNewsroomScraper.js';
import { scrapeCompanyCareers } from './scrapers/companyCareersScraper.js';
import { scrapeCompanyDocs } from './scrapers/companyDocsScraper.js';
import type { DetectedSignal } from './scrapers/originationScraperTypes.js';

const sanitizeText = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const nowIso = () => new Date().toISOString();
const toConfidence = (status: 'real' | 'partial') => (status === 'real' ? 0.82 : 0.45);

const connectorMetadata = (sourceUrl: string, collectedAt: string, confidenceScore: number) => ({ sourceUrl, collectedAt, timestamp: collectedAt, confidenceScore });

export async function fetchBrasilApiCompany(cnpj: string) {
  const endpoint = `https://brasilapi.com.br/api/cnpj/v1/${cnpj.replace(/\D/g, '')}`;
  try {
    const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`BrasilAPI status ${response.status}`);
    return { status: 'real' as const, data: await response.json(), endpoint };
  } catch (error) {
    return { status: 'partial' as const, data: { fallback: true, cnpj, error: error instanceof Error ? error.message : 'unknown_error' }, endpoint };
  }
}

export async function fetchRssFeed(feedUrl: string) {
  try {
    const response = await fetch(feedUrl, { headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error(`RSS status ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<pubDate>(.*?)<\/pubDate>)?[\s\S]*?<description>(.*?)<\/description>/g)].slice(0, 3).map((match) => ({ title: sanitizeText(match[1] ?? ''), link: sanitizeText(match[2] ?? ''), publishedAt: sanitizeText(match[3] ?? nowIso()), description: sanitizeText(match[4] ?? '') }));
    return { status: 'real' as const, items, sourceUrl: feedUrl };
  } catch (error) {
    return { status: 'partial' as const, items: [{ title: 'RSS fallback', link: feedUrl, publishedAt: new Date().toUTCString(), description: error instanceof Error ? error.message : 'unknown_error' }], sourceUrl: feedUrl };
  }
}

export async function monitorCompanyWebsite(url: string) {
  try {
    const response = await fetch(url, { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`Website status ${response.status}`);
    const html = await response.text();
    const title = sanitizeText(html.match(/<title>(.*?)<\/title>/i)?.[1] ?? 'homepage');
    const headings = [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)].slice(0, 6).map((match) => sanitizeText(match[1]));
    const bodyText = sanitizeText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 1200);
    return { status: 'real' as const, title, headings, bodyText, sourceUrl: url };
  } catch (error) {
    return { status: 'partial' as const, title: 'website_fallback', headings: [error instanceof Error ? error.message : 'unreachable'], bodyText: '', sourceUrl: url };
  }
}

const deriveSignalType = (text: string) => {
  const value = text.toLowerCase();
  if (/expans|nova regi|novo canal|crescimento/.test(value)) return 'expansion_signal';
  if (/fidc|funding|capital|deb[êe]nture|capta/.test(value)) return 'capital_mismatch';
  if (/receb[ií]veis|cart[ãa]o|antecip/.test(value)) return 'receivables_strong';
  if (/embedded|wallet|pix|checkout|pagamento/.test(value)) return 'embedded_finance';
  if (/contrata|vaga|risk|cobran|underwriting/.test(value)) return 'growth_without_funding';
  return 'market_signal';
};

const signalStrengthFromText = (text: string) => (/expans|funding|capital|receb[ií]veis|embedded|contrata/.test(text.toLowerCase()) ? 78 : 62);

const buildSignal = (company: CompanySeed, sourceId: string, idSuffix: string, text: string, collectedAt: string, status: 'real' | 'partial', sourceUrl: string): CompanySignal => ({
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

const buildDetectedSignal = (company: CompanySeed, sourceId: string, index: number, signal: DetectedSignal, collectedAt: string): CompanySignal => ({
  id: `${company.id}_${sourceId}_detected_${index + 1}`,
  companyId: company.id,
  sourceId,
  signalType: signal.type,
  signalStrength: signal.strength,
  confidenceScore: signal.confidenceScore,
  evidencePayload: { matchedKeywords: signal.matchedKeywords, evidence: signal.evidence, sourceUrl: signal.sourceUrl, sourceType: signal.sourceType, timestamp: collectedAt },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

const buildMonitoringOutput = (company: CompanySeed, sourceId: string, title: string, summary: string, collectedAt: string, connectorStatus: 'real' | 'partial', normalizedPayload: Record<string, unknown>): MonitoringOutput => ({
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
  payload: { governanceMaturity: payload.porte ? 'medium_high' : company.enrichment.governanceMaturity, underwritingMaturity: company.enrichment.underwritingMaturity, operationalMaturity: company.enrichment.operationalMaturity, riskModelMaturity: company.enrichment.riskModelMaturity, unitEconomicsQuality: company.enrichment.unitEconomicsQuality, spreadVsFundingQuality: company.enrichment.spreadVsFundingQuality, concentrationRisk: company.enrichment.concentrationRisk, delinquencySignal: company.enrichment.delinquencySignal, sourceConfidence: payload.fallback ? 0.52 : 0.84, sourceNotes: [`CNPJ consultado via BrasilAPI (${payload.razao_social ?? company.tradeName}).`, payload.capital_social ? `Capital social público: ${payload.capital_social}.` : 'Capital social não disponível publicamente.'], brasilApi: payload, sourceUrl, collectedAt },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

const buildSignalPackEnrichment = (company: CompanySeed, collectedAt: string, id: string, type: string, provider: string, sourceConfidence: number, metadata: Record<string, unknown>, signals: DetectedSignal[]): EnrichmentRecord => ({
  id: `${company.id}_${id}`,
  companyId: company.id,
  enrichmentType: type,
  provider,
  payload: { sourceConfidence, sourceNotes: signals.slice(0, 5).map((signal) => `${signal.type}: ${signal.matchedKeywords.join(', ')}`), metadata, topSignals: signals.slice(0, 10) },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

export async function ingestCompanyMonitoring(company: CompanySeed, sources: SourceCatalogEntry[]) {
  const collectedAt = nowIso();
  const rssSources = [
    { id: 'src_google_news_rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(company.tradeName)}` },
    { id: 'src_cvm_rss', url: 'https://www.gov.br/cvm/pt-br/assuntos/noticias/rss' },
    { id: 'src_valor_rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(company.tradeName + ' funding OR crédito')}&hl=pt-BR&gl=BR&ceid=BR:pt-419` },
  ].filter((source) => sources.some((item) => item.id === source.id) || source.id !== 'src_valor_rss');

  const shouldRunDeepWebsite = sources.some((item) => item.id === 'src_company_website_deep');
  const shouldRunProfessionalNetwork = sources.some((item) => item.id === 'src_professional_network_company');
  const shouldRunNewsroom = sources.some((item) => item.id === 'src_company_newsroom');
  const shouldRunCareers = sources.some((item) => item.id === 'src_company_careers');
  const shouldRunDocs = sources.some((item) => item.id === 'src_company_docs');

  const [website, brasilApi, websiteDeepRun, professionalNetworkRun, newsroomRun, careersRun, docsRun, ...rssResults] = await Promise.all([
    monitorCompanyWebsite(company.website),
    fetchBrasilApiCompany(company.cnpj),
    shouldRunDeepWebsite ? scrapeCompanyWebsiteDeep({ companyId: company.id, companyName: company.tradeName, website: company.website }) : Promise.resolve(null),
    shouldRunProfessionalNetwork ? scrapeProfessionalNetworkCompany({ companyId: company.id, companyName: company.tradeName }) : Promise.resolve(null),
    shouldRunNewsroom ? scrapeCompanyNewsroom({ companyId: company.id, companyName: company.tradeName, website: company.website }) : Promise.resolve(null),
    shouldRunCareers ? scrapeCompanyCareers({ companyId: company.id, companyName: company.tradeName, website: company.website }) : Promise.resolve(null),
    shouldRunDocs ? scrapeCompanyDocs({ companyId: company.id, companyName: company.tradeName, website: company.website }) : Promise.resolve(null),
    ...rssSources.map((source) => fetchRssFeed(source.url)),
  ]);

  const outputs: MonitoringOutput[] = [
    { id: `${company.id}_website`, companyId: company.id, sourceId: 'src_company_website', title: `Website monitor · ${website.title}`, summary: website.headings.join(' | ') || website.bodyText.slice(0, 180) || 'Sem conteúdo capturado.', collectedAt, confidenceScore: website.status === 'real' ? 0.74 : 0.42, connectorStatus: website.status, normalizedPayload: { ...website, ...connectorMetadata(website.sourceUrl, collectedAt, website.status === 'real' ? 0.74 : 0.42) } },
    { id: `${company.id}_brasilapi`, companyId: company.id, sourceId: 'src_brasilapi_cnpj', title: `BrasilAPI CNPJ · ${company.tradeName}`, summary: brasilApi.data.razao_social ? `${brasilApi.data.razao_social} · ${brasilApi.data.descricao_situacao_cadastral ?? 'situação consultada'}` : `Consulta ${brasilApi.status} para ${company.cnpj}`, collectedAt, confidenceScore: brasilApi.status === 'real' ? 0.88 : 0.5, connectorStatus: brasilApi.status, normalizedPayload: { payload: brasilApi.data as Record<string, unknown>, endpoint: brasilApi.endpoint, ...connectorMetadata(brasilApi.endpoint, collectedAt, brasilApi.status === 'real' ? 0.88 : 0.5) } },
    ...rssResults.map((rss, index) => ({ id: `${company.id}_${rssSources[index].id}`, companyId: company.id, sourceId: rssSources[index].id, title: `${rssSources[index].id} · ${company.tradeName}`, summary: rss.items.map((item) => item.title).join(' | '), collectedAt, confidenceScore: rss.status === 'real' ? 0.7 : 0.4, connectorStatus: rss.status, normalizedPayload: { items: rss.items, ...connectorMetadata(rss.sourceUrl, collectedAt, rss.status === 'real' ? 0.7 : 0.4) } })),
  ];

  const packRuns = [
    ['src_company_website_deep', websiteDeepRun, company.website, 0.81, `Website deep scrape · ${company.tradeName}`],
    ['src_professional_network_company', professionalNetworkRun, String(professionalNetworkRun?.metadata?.requestedUrl ?? ''), 0.76, `Professional network company profile · ${company.tradeName}`],
    ['src_company_newsroom', newsroomRun, company.website, 0.74, `Company newsroom scrape · ${company.tradeName}`],
    ['src_company_careers', careersRun, company.website, 0.75, `Company careers scrape · ${company.tradeName}`],
    ['src_company_docs', docsRun, company.website, 0.73, `Company docs scrape · ${company.tradeName}`],
  ] as const;

  for (const [sourceId, run, sourceUrl, confidence, title] of packRuns) {
    if (!run) continue;
    outputs.push(buildMonitoringOutput(company, sourceId, title, run.signals.slice(0, 4).map((signal) => signal.type).join(' | ') || run.consolidatedText.slice(0, 180) || 'Sem sinais relevantes.', collectedAt, run.connectorStatus, { pages: run.pages, signalCount: run.signals.length, metadata: run.metadata, ...connectorMetadata(sourceUrl, collectedAt, run.connectorStatus === 'real' ? confidence : 0.45) }));
  }

  const signals: CompanySignal[] = [
    buildSignal(company, 'src_company_website', 'website', website.headings.join(' | ') || website.bodyText || `Website update ${company.tradeName}`, collectedAt, website.status, website.sourceUrl),
    buildSignal(company, 'src_brasilapi_cnpj', 'brasilapi', brasilApi.data.porte ? `${brasilApi.data.porte} ${brasilApi.data.cnae_fiscal_descricao ?? ''}` : `Consulta cadastral ${company.tradeName}`, collectedAt, brasilApi.status, brasilApi.endpoint),
    ...rssResults.flatMap((rss, index) => rss.items.slice(0, 2).map((item, itemIndex) => buildSignal(company, rssSources[index].id, `rss_${itemIndex + 1}`, `${item.title}. ${item.description}`.trim(), collectedAt, rss.status, item.link || rss.sourceUrl))),
    ...(websiteDeepRun ? websiteDeepRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_company_website_deep', index, signal, collectedAt)) : []),
    ...(professionalNetworkRun ? professionalNetworkRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_professional_network_company', index, signal, collectedAt)) : []),
    ...(newsroomRun ? newsroomRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_company_newsroom', index, signal, collectedAt)) : []),
    ...(careersRun ? careersRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_company_careers', index, signal, collectedAt)) : []),
    ...(docsRun ? docsRun.signals.map((signal, index) => buildDetectedSignal(company, 'src_company_docs', index, signal, collectedAt)) : []),
  ];

  const enrichments: EnrichmentRecord[] = [buildBrasilApiEnrichment(company, brasilApi.data as Record<string, any>, collectedAt, brasilApi.endpoint)];
  if (websiteDeepRun?.signals.length) enrichments.push(buildSignalPackEnrichment(company, collectedAt, 'enrichment_company_website_deep', 'company_website_b2b_signal_pack', 'company_website_deep_scraper', websiteDeepRun.connectorStatus === 'real' ? 0.81 : 0.47, websiteDeepRun.metadata, websiteDeepRun.signals));
  if (professionalNetworkRun?.signals.length) enrichments.push(buildSignalPackEnrichment(company, collectedAt, 'enrichment_professional_network_profile', 'professional_network_signal_pack', 'professional_network_company_scraper', professionalNetworkRun.connectorStatus === 'real' ? 0.76 : 0.44, professionalNetworkRun.metadata, professionalNetworkRun.signals));
  if (newsroomRun?.signals.length) enrichments.push(buildSignalPackEnrichment(company, collectedAt, 'enrichment_company_newsroom', 'company_newsroom_signal_pack', 'company_newsroom_scraper', newsroomRun.connectorStatus === 'real' ? 0.74 : 0.43, newsroomRun.metadata, newsroomRun.signals));
  if (careersRun?.signals.length) enrichments.push(buildSignalPackEnrichment(company, collectedAt, 'enrichment_company_careers', 'company_careers_signal_pack', 'company_careers_scraper', careersRun.connectorStatus === 'real' ? 0.75 : 0.43, careersRun.metadata, careersRun.signals));
  if (docsRun?.signals.length) enrichments.push(buildSignalPackEnrichment(company, collectedAt, 'enrichment_company_docs', 'company_docs_signal_pack', 'company_docs_scraper', docsRun.connectorStatus === 'real' ? 0.73 : 0.42, docsRun.metadata, docsRun.signals));

  return { outputs, signals, enrichments };
}
