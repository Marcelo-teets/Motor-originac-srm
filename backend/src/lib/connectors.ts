import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';
import { ingestFreeOfficialCompanySources } from './connectors/freeOfficialDataSources.js';

const sanitizeText = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();
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

const SEEDED_SOURCE_CODES = new Map<string, string>([
  ['rfb cnpj bulk', 'src_rfb_cnpj_bulk'],
  ['pgfn divida ativa bulk', 'src_pgfn_divida_ativa_bulk'],
  ['bndes financing operations', 'src_bndes_financing_operations'],
  ['cgu transparencia bulk', 'src_cgu_transparencia_bulk'],
  ['compras gov contracts', 'src_compras_gov_contracts'],
  ['consumidor gov open data', 'src_consumidor_gov_open_data'],
  ['inlabs dou xml', 'src_inlabs_dou_xml'],
  ['inpi ip open data', 'src_inpi_ip_open_data'],
  ['bcb ifdata', 'src_bcb_ifdata'],
  ['bcb complaints ranking', 'src_bcb_complaints_ranking'],
  ['github public api', 'src_github_public_api'],
  ['bcb pix participants', 'src_bcb_pix_participants'],
  ['transferegov public api', 'src_transferegov_public_api'],
  ['wayback company history', 'src_wayback_company_history'],
  ['common crawl company history', 'src_common_crawl_company_history'],
  ['datajud public api', 'src_datajud_public_api'],
  ['comexstat open data', 'src_comexstat_open_data'],
]);

const websiteDomain = (website: string) => {
  try {
    return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '');
  } catch {
    return website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || website;
  }
};

export const inferSourceCode = (source: SourceCatalogEntry) => {
  const explicit = typeof source.metadata?.code === 'string' ? source.metadata.code : undefined;
  if (explicit) return explicit;

  const name = normalizeText(source.name ?? '');
  const seededSourceCode = SEEDED_SOURCE_CODES.get(name.trim());
  if (seededSourceCode) return seededSourceCode;

  const category = normalizeText(source.category ?? '');
  const tags = Array.isArray(source.metadata?.tags)
    ? source.metadata.tags.map((tag) => normalizeText(String(tag))).join(' ')
    : '';
  const blob = `${name} ${category} ${tags}`;

  if (blob.includes('company websites') || blob.includes('site_empresa') || blob.includes('company_site')) return 'src_company_website';
  if (blob.includes('receita') || blob.includes('cnpj')) return 'src_brasilapi_cnpj';
  if (blob.includes('cvm') || blob.includes('fidc')) return 'src_cvm_rss';
  if (blob.includes('pipeline valor') || blob.includes('brazil journal') || blob.includes('capital')) return 'src_valor_rss';
  if (blob.includes('startup') || blob.includes('fintech') || blob.includes('noticia') || blob.includes('credito')) return 'src_google_news_rss';
  return `src_${name.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || source.id}`;
};

type RuntimeSource = SourceCatalogEntry & { runtimeCode: string };

type SignalTreatmentRule = {
  signalType: string;
  strength: number;
  pattern: RegExp;
};

const SIGNAL_TREATMENT_RULES: SignalTreatmentRule[] = [
  { signalType: 'judicial_stress', strength: 95, pattern: /recuperacao judicial|falencia|execucao fiscal|processo credores|administrador judicial/ },
  { signalType: 'legal_compliance_risk', strength: 86, pattern: /ceis|cnep|inidonea|suspensa|sancao|sancoes|portal da transparencia/ },
  { signalType: 'fiscal_stress', strength: 84, pattern: /divida ativa|pgfn|debito tributario|passivo fiscal|regularidade fiscal/ },
  { signalType: 'liquidity_stress', strength: 84, pattern: /protesto|cartorio|cenprot|cndt|certidao negativa/ },
  { signalType: 'public_contract_receivables', strength: 82, pattern: /pncp|licitacao|contrato publico|empenho|fornecedor|pregao|comprasnet|compras\.gov|transferegov|ata de registro/ },
  { signalType: 'product_credit_terms', strength: 83, pattern: /termos de uso|politica de credito|limite de credito|financiamento|parcelamento|antecipacao de recebiveis|cessao de recebiveis/ },
  { signalType: 'financial_infrastructure_signal', strength: 80, pattern: /open finance|if\.data|participante pix|instituicao de pagamento|iniciador|banco central|arranjo de pagamento|pix|wallet|checkout/ },
  { signalType: 'regulatory_event', strength: 78, pattern: /diario oficial|inlabs|dou|portaria|autorizacao|credenciamento|homologacao|ato declaratorio|resolucao|normativo/ },
  { signalType: 'credit_team_hiring', strength: 77, pattern: /vaga|contrata|head de credito|risco de credito|underwriting|cobranca|collections|analista de credito|funding/ },
  { signalType: 'vc_portfolio_signal', strength: 76, pattern: /portfolio|investida|venture capital|rodada|seed|series a|series b|growth capital|follow on/ },
  { signalType: 'public_financing_signal', strength: 76, pattern: /bndes|finep|financiamento publico|capital de giro|inovacao/ },
  { signalType: 'demand_quality_risk', strength: 73, pattern: /consumidor\.gov|ranking de reclamacoes|reclame aqui|chargeback|cancelamento|contestacao|inadimplencia|atraso|reclamacao/ },
  { signalType: 'international_receivables_signal', strength: 70, pattern: /comexstat|exportacao|importacao|cambio|recebiveis internacionais|contrato internacional/ },
  { signalType: 'technical_product_signal', strength: 70, pattern: /github|api|sdk|documentacao|developer|boleto|marketplace|webhook/ },
  { signalType: 'market_education_signal', strength: 68, pattern: /youtube|webinar|live|evento online|aula|educacao de mercado/ },
  { signalType: 'product_expansion_signal', strength: 66, pattern: /wayback|common crawl|inpi|marca|patente|software|registro de marca|propriedade intelectual/ },
  { signalType: 'expansion_signal', strength: 78, pattern: /expans|nova regi|novo canal|crescimento/ },
  { signalType: 'capital_mismatch', strength: 78, pattern: /fidc|funding|capital|debenture|captacao|nota comercial|securitizacao|cri|cra/ },
  { signalType: 'receivables_strong', strength: 78, pattern: /recebiveis|cartao|antecip/ },
  { signalType: 'embedded_finance', strength: 76, pattern: /embedded|pagamento|credito as a service|bnpl|lending/ },
  { signalType: 'growth_without_funding', strength: 74, pattern: /risk|cobran|underwriting|escala|operacao nacional/ },
];

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
  .replace(/{website}/g, company.website ?? '')
  .replace(/{websiteDomain}/g, websiteDomain(company.website ?? ''))
  .replace(/\s+/g, ' ')
  .trim();

const isRssRuntimeSource = (source: RuntimeSource) => source.sourceType === 'rss'
  || source.metadata?.sourceType === 'rss'
  || typeof source.metadata?.queryTemplate === 'string'
  || source.runtimeCode.endsWith('_rss');

const parametricRssSourcesFor = (sources: RuntimeSource[], company: CompanySeed) => sources
  .filter(isRssRuntimeSource)
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
    return {
      status: 'partial' as const,
      data: { fallback: true, cnpj, error: error instanceof Error ? error.message : 'unknown_error' },
      endpoint,
    };
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
      items: [{
        title: 'RSS fallback',
        link: feedUrl,
        publishedAt: new Date().toUTCString(),
        description: error instanceof Error ? error.message : 'unknown_error',
      }],
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
    const headings = [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)]
      .slice(0, 6)
      .map((match) => sanitizeText(match[1]));
    const bodyText = sanitizeText(
      html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '),
    ).slice(0, 1200);
    return { status: 'real' as const, title, headings, bodyText, sourceUrl: url };
  } catch (error) {
    return {
      status: 'partial' as const,
      title: 'website_fallback',
      headings: [error instanceof Error ? error.message : 'unreachable'],
      bodyText: '',
      sourceUrl: url,
    };
  }
}

const signalTreatmentFromText = (text: string) => {
  const value = normalizeText(text);
  return SIGNAL_TREATMENT_RULES.find((rule) => rule.pattern.test(value));
};

const buildSignal = (
  company: CompanySeed,
  source: RuntimeSource,
  idSuffix: string,
  text: string,
  collectedAt: string,
  status: 'real' | 'partial',
  sourceUrl: string,
): CompanySignal => {
  const treatment = signalTreatmentFromText(text);
  return {
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId: source.id,
    signalType: treatment?.signalType ?? 'market_signal',
    signalStrength: treatment?.strength ?? 62,
    confidenceScore: toConfidence(status),
    evidencePayload: {
      note: text,
      source: source.id,
      sourceCode: source.runtimeCode,
      sourceName: source.name,
      sourceUrl,
      timestamp: collectedAt,
      confidenceScore: toConfidence(status),
      idSuffix,
      treatmentRule: treatment?.signalType ?? 'market_signal',
    },
    observedVsInferred: 'observed',
    createdAt: collectedAt,
  };
};

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

const buildBrasilApiEnrichment = (
  company: CompanySeed,
  source: RuntimeSource,
  payload: Record<string, any>,
  collectedAt: string,
  sourceUrl: string,
): EnrichmentRecord => {
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

  const [website, brasilApi, freeOfficial, ...rssResults] = await Promise.all([
    websiteSource ? monitorCompanyWebsite(company.website) : Promise.resolve(null),
    brasilApiSource ? fetchBrasilApiCompany(company.cnpj) : Promise.resolve(null),
    ingestFreeOfficialCompanySources(company, runtimeSources, collectedAt),
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
      {
        ...website,
        ...connectorMetadata(website.sourceUrl, collectedAt, website.status === 'real' ? 0.74 : 0.42, websiteSource.runtimeCode),
      },
    )] : []),
    ...(brasilApi && brasilApiSource ? [buildOutput(
      company,
      brasilApiSource,
      `BrasilAPI CNPJ · ${company.tradeName}`,
      brasilApi.data.razao_social
        ? `${brasilApi.data.razao_social} · ${brasilApi.data.descricao_situacao_cadastral ?? 'situação consultada'}`
        : `Consulta ${brasilApi.status} para ${company.cnpj}`,
      collectedAt,
      brasilApi.status,
      brasilApi.status === 'real' ? 0.88 : 0.5,
      {
        payload: brasilApi.data as Record<string, unknown>,
        endpoint: brasilApi.endpoint,
        ...connectorMetadata(brasilApi.endpoint, collectedAt, brasilApi.status === 'real' ? 0.88 : 0.5, brasilApiSource.runtimeCode),
      },
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
        {
          items: rss.items,
          ...connectorMetadata(rss.sourceUrl, collectedAt, rss.status === 'real' ? 0.7 : 0.4, runtime.source.runtimeCode),
        },
      );
    }),
    ...freeOfficial.outputs,
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
      brasilApi.data.porte
        ? `${brasilApi.data.porte} ${brasilApi.data.cnae_fiscal_descricao ?? ''}`
        : `Consulta cadastral ${company.tradeName}`,
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
    ...freeOfficial.signals,
  ];

  const enrichments: EnrichmentRecord[] = [
    ...(brasilApi && brasilApiSource
      ? [buildBrasilApiEnrichment(company, brasilApiSource, brasilApi.data as Record<string, any>, collectedAt, brasilApi.endpoint)]
      : []),
    ...freeOfficial.enrichments,
  ];

  return { outputs, signals, enrichments };
}
