import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

const sanitizeText = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const nowIso = () => new Date().toISOString();
const toConfidence = (status: 'real' | 'partial') => (status === 'real' ? 0.82 : 0.45);

const connectorMetadata = (sourceUrl: string, collectedAt: string, confidenceScore: number, sourceCode: string) => ({
  sourceUrl,
  collectedAt,
  timestamp: collectedAt,
  confidenceScore,
  sourceCode,
});

const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const inferSourceCode = (source: SourceCatalogEntry) => {
  const explicit = typeof source.metadata?.code === 'string' ? source.metadata.code : undefined;
  if (explicit) return explicit;

  const name = normalizeText(source.name ?? '');
  const category = normalizeText(source.category ?? '');
  const tags = Array.isArray(source.metadata?.tags) ? source.metadata.tags.map((tag) => normalizeText(String(tag))).join(' ') : '';
  const blob = `${name} ${category} ${tags}`;

  if (blob.includes('company websites') || blob.includes('site_empresa') || blob.includes('company_site')) return 'src_company_website';
  if (blob.includes('receita') || blob.includes('cnpj')) return 'src_brasilapi_cnpj';
  if (blob.includes('cvm') || blob.includes('fidc')) return 'src_cvm_rss';
  if (blob.includes('pipeline valor') || blob.includes('brazil journal') || blob.includes('capital')) return 'src_valor_rss';
  if (blob.includes('startup') || blob.includes('fintech') || blob.includes('noticia') || blob.includes('credito')) return 'src_google_news_rss';
  return `src_${name.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || source.id}`;
};

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

const buildRuntimeSources = (sources: SourceCatalogEntry[]) => sources
  .filter((source) => source.status !== 'planned')
  .map((source) => ({ ...source, runtimeCode: inferSourceCode(source) } satisfies RuntimeSource));

const firstSource = (sources: RuntimeSource[], code: string) => sources.find((source) => source.runtimeCode === code);

const sourceUrlFor = (source: RuntimeSource | undefined, fallback: string) => typeof source?.metadata?.feedUrl === 'string'
  ? source.metadata.feedUrl
  : source?.url || fallback;

const googleNewsRssUrl = (query: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

const renderQueryTemplate = (template: string, company: CompanySeed) => template
  .replace(/{company}/g, company.tradeName)
  .replace(/{tradeName}/g, company.tradeName)
  .replace(/{legalName}/g, company.legalName)
  .replace(/{segment}/g, company.segment)
  .replace(/{subsegment}/g, company.subsegment ?? '')
  .replace(/{cnpj}/g, company.cnpj ?? '')
  .replace(/\s+/g, ' ')
  .trim();

const parametricRssSourcesFor = (sources: RuntimeSource[], company: CompanySeed) => sources
  .filter((source) => source.sourceType === 'rss')
  .map((source) => {
    const template = typeof source.metadata?.queryTemplate === 'string' ? source.metadata.queryTemplate : '';
    if (!template) return null;
    const query = renderQueryTemplate(template, company);
    if (!query) return null;
    return { source, url: googleNewsRssUrl(query) };
  })
  .filter((item): item is { source: RuntimeSource; url: string } => Boolean(item));

const dedupeRssSources = (sources: Array<{ source: RuntimeSource; url: string }>) => {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.source.id}|${source.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<pubDate>(.*?)<\/pubDate>)?[\s\S]*?<description>(.*?)<\/description>/g)]
      .slice(0, 3)
      .map((match) => ({
        title: sanitizeText(match[1] ?? ''),
        link: sanitizeText(match[2] ?? ''),
        publishedAt: sanitizeText(match[3] ?? nowIso()),
        description: sanitizeText(match[4] ?? ''),
      }));
    return { status: 'real' as const, items, sourceUrl: feedUrl };
  } catch (error) {
    return {
      status: 'partial' as const,
      items: [{ title: 'RSS fallback', link: feedUrl, publishedAt: new Date().toUTCString(), description: error instanceof Error ? error.message : 'unknown_error' }],
      sourceUrl: feedUrl,
    };
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

const signalStrengthFromText = (text: string) => {
  const value = text.toLowerCase();
  if (/expans|funding|capital|receb[ií]veis|embedded|contrata/.test(value)) return 78;
  return 62;
};

const buildSignal = (
  company: CompanySeed,
  source: RuntimeSource,
  idSuffix: string,
  text: string,
  collectedAt: string,
  status: 'real' | 'partial',
  sourceUrl: string,
): CompanySignal => ({
  id: crypto.randomUUID(),
  companyId: company.id,
  sourceId: source.id,
  signalType: deriveSignalType(text),
  signalStrength: signalStrengthFromText(text),
  confidenceScore: toConfidence(status),
  evidencePayload: { note: text, source: source.id, sourceCode: source.runtimeCode, sourceName: source.name, sourceUrl, timestamp: collectedAt, confidenceScore: toConfidence(status), idSuffix },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

const buildOutput = (
  company: CompanySeed,
  source: RuntimeSource,
  title: string,
  summary: string,
  collectedAt: string,
  status: 'real' | 'partial',
  confidenceScore: number,
  payload: Record<string, unknown>,
): MonitoringOutput => ({
  id: crypto.randomUUID(),
  companyId: company.id,
  sourceId: source.id,
  title,
  summary,
  collectedAt,
  confidenceScore,
  connectorStatus: status,
  normalizedPayload: {
    ...payload,
    sourceCode: source.runtimeCode,
    sourceName: source.name,
    sourceCategory: source.category,
  },
});

const buildBrasilApiEnrichment = (company: CompanySeed, source: RuntimeSource, payload: Record<string, any>, collectedAt: string, sourceUrl: string): EnrichmentRecord => {
  const sourceConfidence = payload.fallback ? 0.52 : 0.84;
  return {
    id: crypto.randomUUID(),
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
      sourceConfidence,
      sourceId: source.id,
      sourceCode: source.runtimeCode,
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
  };
};

export async function ingestCompanyMonitoring(company: CompanySeed, sources: SourceCatalogEntry[]) {
  const collectedAt = nowIso();
  const runtimeSources = buildRuntimeSources(sources);
  const websiteSource = firstSource(runtimeSources, 'src_company_website');
  const brasilApiSource = firstSource(runtimeSources, 'src_brasilapi_cnpj');
  const cvmSource = firstSource(runtimeSources, 'src_cvm_rss');
  const valorSource = firstSource(runtimeSources, 'src_valor_rss');
  const googleNewsSource = firstSource(runtimeSources, 'src_google_news_rss');

  const rssSources = dedupeRssSources([
    googleNewsSource ? { source: googleNewsSource, url: googleNewsRssUrl(company.tradeName) } : null,
    cvmSource ? { source: cvmSource, url: sourceUrlFor(cvmSource, 'https://www.gov.br/cvm/pt-br/assuntos/noticias/rss') } : null,
    valorSource ? { source: valorSource, url: googleNewsRssUrl(`${company.tradeName} funding OR crédito OR FIDC OR debênture`) } : null,
    ...parametricRssSourcesFor(runtimeSources, company),
  ].filter((item): item is { source: RuntimeSource; url: string } => Boolean(item)));

  const [website, brasilApi, ...rssResults] = await Promise.all([
    websiteSource ? monitorCompanyWebsite(company.website) : Promise.resolve(null),
    brasilApiSource ? fetchBrasilApiCompany(company.cnpj) : Promise.resolve(null),
    ...rssSources.map((source) => fetchRssFeed(source.url)),
  ]);

  const outputs: MonitoringOutput[] = [
    ...(website && websiteSource ? [buildOutput(
      company,
      websiteSource,
      `Website monitor · ${website.title}`,
      website.headings.join(' | ') || website.bodyText.slice(0, 180) || 'Sem conteúdo capturado.',
      collectedAt,
      website.status,
      website.status === 'real' ? 0.74 : 0.42,
      { ...website, ...connectorMetadata(website.sourceUrl, collectedAt, website.status === 'real' ? 0.74 : 0.42, websiteSource.runtimeCode) },
    )] : []),
    ...(brasilApi && brasilApiSource ? [buildOutput(
      company,
      brasilApiSource,
      `BrasilAPI CNPJ · ${company.tradeName}`,
      brasilApi.data.razao_social ? `${brasilApi.data.razao_social} · ${brasilApi.data.descricao_situacao_cadastral ?? 'situação consultada'}` : `Consulta ${brasilApi.status} para ${company.cnpj}`,
      collectedAt,
      brasilApi.status,
      brasilApi.status === 'real' ? 0.88 : 0.5,
      { payload: brasilApi.data as Record<string, unknown>, endpoint: brasilApi.endpoint, ...connectorMetadata(brasilApi.endpoint, collectedAt, brasilApi.status === 'real' ? 0.88 : 0.5, brasilApiSource.runtimeCode) },
    )] : []),
    ...rssResults.map((rss, index) => {
      const runtime = rssSources[index];
      return buildOutput(
        company,
        runtime.source,
        `${runtime.source.name} · ${company.tradeName}`,
        rss.items.map((item) => item.title).join(' | '),
        collectedAt,
        rss.status,
        rss.status === 'real' ? 0.7 : 0.4,
        { items: rss.items, ...connectorMetadata(rss.sourceUrl, collectedAt, rss.status === 'real' ? 0.7 : 0.4, runtime.source.runtimeCode) },
      );
    }),
  ];

  const signals: CompanySignal[] = [
    ...(website && websiteSource ? [buildSignal(
      company,
      websiteSource,
      'website',
      website.headings.join(' | ') || website.bodyText || `Website update ${company.tradeName}`,
      collectedAt,
      website.status,
      website.sourceUrl,
    )] : []),
    ...(brasilApi && brasilApiSource ? [buildSignal(
      company,
      brasilApiSource,
      'brasilapi',
      brasilApi.data.porte ? `${brasilApi.data.porte} ${brasilApi.data.cnae_fiscal_descricao ?? ''}` : `Consulta cadastral ${company.tradeName}`,
      collectedAt,
      brasilApi.status,
      brasilApi.endpoint,
    )] : []),
    ...rssResults.flatMap((rss, index) => rss.items.slice(0, 2).map((item, itemIndex) => buildSignal(
      company,
      rssSources[index].source,
      `rss_${itemIndex + 1}`,
      `${item.title}. ${item.description}`.trim(),
      collectedAt,
      rss.status,
      item.link || rss.sourceUrl,
    ))),
  ];

  const enrichments: EnrichmentRecord[] = brasilApi && brasilApiSource
    ? [buildBrasilApiEnrichment(company, brasilApiSource, brasilApi.data as Record<string, any>, collectedAt, brasilApi.endpoint)]
    : [];

  return { outputs, signals, enrichments };
}
