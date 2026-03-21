import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

const sanitizeText = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const nowIso = () => new Date().toISOString();
const toConfidence = (status: 'real' | 'partial') => (status === 'real' ? 0.82 : 0.45);

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
    return { status: 'real' as const, items };
  } catch (error) {
    return { status: 'partial' as const, items: [{ title: 'RSS fallback', link: feedUrl, publishedAt: new Date().toUTCString(), description: error instanceof Error ? error.message : 'unknown_error' }] };
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
    return { status: 'real' as const, title, headings, bodyText };
  } catch (error) {
    return { status: 'partial' as const, title: 'website_fallback', headings: [error instanceof Error ? error.message : 'unreachable'], bodyText: '' };
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

const buildSignal = (company: CompanySeed, sourceId: string, idSuffix: string, text: string, collectedAt: string, status: 'real' | 'partial'): CompanySignal => ({
  id: `${company.id}_${sourceId}_${idSuffix}`,
  companyId: company.id,
  sourceId,
  signalType: deriveSignalType(text),
  signalStrength: signalStrengthFromText(text),
  confidenceScore: toConfidence(status),
  evidencePayload: { note: text, source: sourceId },
  observedVsInferred: 'observed',
  createdAt: collectedAt,
});

const buildBrasilApiEnrichment = (company: CompanySeed, payload: Record<string, any>, collectedAt: string): EnrichmentRecord => {
  const sourceConfidence = payload.fallback ? 0.52 : 0.84;
  return {
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
      sourceConfidence,
      sourceNotes: [
        `CNPJ consultado via BrasilAPI (${payload.razao_social ?? company.tradeName}).`,
        payload.capital_social ? `Capital social público: ${payload.capital_social}.` : 'Capital social não disponível publicamente.',
      ],
      brasilApi: payload,
    },
    observedVsInferred: 'observed',
    createdAt: collectedAt,
  };
};

export async function ingestCompanyMonitoring(company: CompanySeed, sources: SourceCatalogEntry[]) {
  const collectedAt = nowIso();
  const rssSources = [
    { id: 'src_google_news_rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(company.tradeName)}` },
    { id: 'src_cvm_rss', url: 'https://www.gov.br/cvm/pt-br/assuntos/noticias/rss' },
    { id: 'src_valor_rss', url: `https://news.google.com/rss/search?q=${encodeURIComponent(company.tradeName + ' funding OR crédito')}&hl=pt-BR&gl=BR&ceid=BR:pt-419` },
  ].filter((source) => sources.some((item) => item.id === source.id) || source.id !== 'src_valor_rss');

  const [website, brasilApi, ...rssResults] = await Promise.all([
    monitorCompanyWebsite(company.website),
    fetchBrasilApiCompany(company.cnpj),
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
      normalizedPayload: website,
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
      normalizedPayload: brasilApi.data as Record<string, unknown>,
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
      normalizedPayload: { items: rss.items },
    })),
  ];

  const signals: CompanySignal[] = [
    buildSignal(company, 'src_company_website', 'website', website.headings.join(' | ') || website.bodyText || `Website update ${company.tradeName}`, collectedAt, website.status),
    buildSignal(company, 'src_brasilapi_cnpj', 'brasilapi', brasilApi.data.porte ? `${brasilApi.data.porte} ${brasilApi.data.cnae_fiscal_descricao ?? ''}` : `Consulta cadastral ${company.tradeName}`, collectedAt, brasilApi.status),
    ...rssResults.flatMap((rss, index) => rss.items.slice(0, 2).map((item, itemIndex) => buildSignal(company, rssSources[index].id, `rss_${itemIndex + 1}`, `${item.title}. ${item.description}`.trim(), collectedAt, rss.status))),
  ];

  const enrichments: EnrichmentRecord[] = [buildBrasilApiEnrichment(company, brasilApi.data as Record<string, any>, collectedAt)];

  return { outputs, signals, enrichments };
}
