import type { SearchProfile } from '../types/platform.js';
import { getSupabaseClient } from './supabase.js';

export type DiscoveryCatalogSource = {
  code: string;
  name: string;
  domain: string;
  category: string;
};

export type DiscoveryUniverseCandidate = {
  id: string;
  companyName: string;
  website?: string;
  cnpj?: string;
  segment: string;
  subsegment: string;
  companyType: string;
  creditProduct: string;
  targetStructure: string;
  sourceRef: string;
  sourceUrl?: string;
  evidenceSummary: string;
  confidence: number;
  candidateStatus: string;
  dedupeKey?: string;
  rawPayload: Record<string, unknown>;
  createdAt?: string;
};

export type DiscoveryCatalogContext = {
  sources: DiscoveryCatalogSource[];
  universe: DiscoveryUniverseCandidate[];
  sourceCatalogLoaded: boolean;
  candidateUniverseLoaded: boolean;
};

const normalize = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const domainFromUrl = (value: unknown) => {
  try {
    return new URL(String(value ?? '')).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
};

const meaningfulTokens = (profile: SearchProfile) => {
  const query = typeof profile.profilePayload?.userQuery === 'string'
    ? profile.profilePayload.userQuery
    : '';
  const stopwords = new Set([
    'empresas', 'empresa', 'com', 'para', 'que', 'podem', 'pode', 'ter', 'fit',
    'potencial', 'sinais', 'brasil', 'brasileiras', 'brasileira', 'precisar',
    'precisando', 'necessidade', 'prontas', 'pronta', 'agora', 'recente',
    'funding', 'capital', 'credito', 'fidc', 'fidcs', 'dcm', 'debenture',
    'debentures', 'estrutura', 'estruturas', 'prontidao', 'pressao',
  ]);
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token))
    .slice(0, 12);
};

const baseSourcePriority = (name: string, category: string) => {
  const haystack = normalize(`${name} ${category}`);
  if (/finsiders|fintech|startup/.test(haystack)) return 0;
  if (/brazil journal|neofeed|valor|bloomberg/.test(haystack)) return 1;
  if (/infomoney|exame/.test(haystack)) return 2;
  if (/distrito|endeavor/.test(haystack)) return 3;
  return 4;
};

const profileSourceContext = (profile: SearchProfile) => normalize([
  profile.segment,
  profile.subsegment,
  profile.companyType,
  profile.creditProduct,
  profile.targetStructure,
  typeof profile.profilePayload?.userQuery === 'string' ? profile.profilePayload.userQuery : '',
].join(' '));

const sourceContextBoost = (profile: SearchProfile, source: DiscoveryCatalogSource) => {
  const context = profileSourceContext(profile);
  const sourceText = normalize(`${source.name} ${source.category} ${source.domain}`);

  const agroIntent = /\b(agro|agtech|agronegocio|agric|rural|cra|safra|frete|transportadora|insumo)\b/.test(context);
  if (agroIntent && /\bagfeed\b|agro business|agronegocio/.test(sourceText)) return -12;

  const fintechIntent = /\b(fintech|embedded|consign|recebive|antecip|fidc|credito|lender|lending)\b/.test(context);
  if (fintechIntent && /finsiders|fintech media|fintechs brasil/.test(sourceText)) return -8;

  const startupIntent = /\b(startup|startups|venture|vc|tech-backed|scaleup|scale-up)\b/.test(context);
  if (startupIntent && /startups br|startup media|distrito|endeavor/.test(sourceText)) return -7;

  const capitalMarketsIntent = /\b(dcm|debent|emissao|emissoes|mercado de capitais|nota comercial|cri|cra)\b/.test(context);
  if (capitalMarketsIntent && /brazil journal|neofeed|valor|bloomberg|infomoney|exame/.test(sourceText)) return -4;

  return 0;
};

export const rankDiscoveryCatalogSources = (
  profile: SearchProfile,
  sources: DiscoveryCatalogSource[],
) => [...sources].sort((a, b) => {
  const scoreA = baseSourcePriority(a.name, a.category) + sourceContextBoost(profile, a);
  const scoreB = baseSourcePriority(b.name, b.category) + sourceContextBoost(profile, b);
  return scoreA - scoreB || a.name.localeCompare(b.name);
});

const mapCatalogSource = (row: any): DiscoveryCatalogSource | null => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  const provider = normalize(metadata.provider);
  const metadataDomain = normalize(metadata.domain).replace(/^www\./, '');
  const domain = metadataDomain || domainFromUrl(row?.url);
  const sourceType = normalize(row?.source_type);
  const category = String(row?.category ?? '');
  const status = normalize(row?.status);
  const health = normalize(row?.health);
  const code = String(metadata.code ?? '').trim();
  const name = String(row?.name ?? code).trim();
  const normalizedName = normalize(name);

  const isHealthyRuntime = Boolean(code)
    && Boolean(domain)
    && health === 'healthy'
    && (status === 'real' || status === 'active');

  const isGoogleNewsBackedRss = sourceType === 'rss'
    && provider === 'google-news-rss'
    && /news|media|business|fintech|startup|agro/i.test(category);

  const isSpecificPublicWebUniverse = sourceType === 'web'
    && /news|vc_portfolio|company_site/i.test(category)
    && /fintechs brasil|distrito|endeavor brasil/.test(normalizedName);

  if (!isHealthyRuntime || (!isGoogleNewsBackedRss && !isSpecificPublicWebUniverse)) return null;
  return { code, name, domain, category };
};

const allowRegulatoryVehicleUniverse = (profile: SearchProfile) => {
  const query = normalize(profile.profilePayload?.userQuery);
  return /emissor|emissao|emissoes|emitida|emitidas|historico|operacoes|fidc existente|fidcs existentes|debenture emitida|debentures emitidas/.test(query);
};

const scoreUniverseCandidate = (profile: SearchProfile, row: DiscoveryUniverseCandidate) => {
  if (row.candidateStatus === 'discarded' || row.candidateStatus === 'rejected') return -Infinity;

  const sourceRef = normalize(row.sourceRef);
  if (sourceRef.startsWith('capital_market_event:') && !allowRegulatoryVehicleUniverse(profile)) return -Infinity;

  const profileSegment = normalize(profile.segment);
  const profileSubsegment = normalize(profile.subsegment);
  const profileTarget = normalize(profile.targetStructure);
  const profileProduct = normalize(profile.creditProduct);
  const rowSegment = normalize(row.segment);
  const rowSubsegment = normalize(row.subsegment);
  const rowTarget = normalize(row.targetStructure);
  const rowProduct = normalize(row.creditProduct);
  const haystack = normalize([
    row.companyName,
    row.segment,
    row.subsegment,
    row.companyType,
    row.creditProduct,
    row.targetStructure,
    row.evidenceSummary,
  ].join(' '));

  let score = 0;
  if (profileSegment && profileSegment !== 'unknown' && (rowSegment.includes(profileSegment) || profileSegment.includes(rowSegment))) score += 3;
  if (profileSubsegment && profileSubsegment !== 'unknown' && (rowSubsegment.includes(profileSubsegment) || profileSubsegment.includes(rowSubsegment))) score += 1.5;
  if (profileTarget && profileTarget !== 'unknown' && (rowTarget.includes(profileTarget) || profileTarget.includes(rowTarget))) score += 2.5;
  if (profileProduct && profileProduct !== 'unknown' && (rowProduct.includes(profileProduct) || profileProduct.includes(rowProduct))) score += 2;

  const tokens = meaningfulTokens(profile);
  score += Math.min(4.2, tokens.filter((token) => haystack.includes(token)).length * 0.7);

  if (/vc-portfolio:/.test(sourceRef) && /fintech|embedded|health|agro|tech|startup|marketplace/.test(profileSegment)) score += 1.5;
  if (sourceRef === 'google-news-rss' || sourceRef.startsWith('src_')) score += 0.5;
  if (row.confidence >= 0.7) score += 0.4;

  return score;
};

const mapUniverseCandidate = (row: any): DiscoveryUniverseCandidate | null => {
  const companyName = String(row?.company_name ?? '').trim();
  if (!companyName) return null;
  return {
    id: String(row.id),
    companyName,
    website: row.website ? String(row.website) : undefined,
    cnpj: row.cnpj ? String(row.cnpj) : undefined,
    segment: String(row.segment ?? 'Unknown'),
    subsegment: String(row.subsegment ?? 'Unknown'),
    companyType: String(row.company_type ?? 'Unknown'),
    creditProduct: String(row.credit_product ?? 'Unknown'),
    targetStructure: String(row.target_structure ?? 'Unknown'),
    sourceRef: String(row.source_ref ?? 'unknown'),
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    evidenceSummary: String(row.evidence_summary ?? ''),
    confidence: Number(row.confidence ?? 0.5),
    candidateStatus: String(row.candidate_status ?? 'captured'),
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : undefined,
    rawPayload: row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {},
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
};

export async function loadDiscoveryCatalogContext(profile: SearchProfile): Promise<DiscoveryCatalogContext> {
  const client = getSupabaseClient();
  if (!client) {
    return { sources: [], universe: [], sourceCatalogLoaded: false, candidateUniverseLoaded: false };
  }

  const [sourceResult, candidateResult] = await Promise.allSettled([
    client.select('source_catalog', {
      select: 'name,url,source_type,category,status,health,metadata',
      limit: 150,
    }),
    client.select('discovered_company_candidates', {
      select: 'id,company_name,website,cnpj,segment,subsegment,company_type,credit_product,target_structure,source_ref,source_url,evidence_summary,confidence,candidate_status,dedupe_key,raw_payload,created_at',
      orderBy: { column: 'created_at', ascending: false },
      limit: 2000,
    }),
  ]);

  const sources = sourceResult.status === 'fulfilled'
    ? rankDiscoveryCatalogSources(
      profile,
      (sourceResult.value ?? [])
        .map(mapCatalogSource)
        .filter((item): item is DiscoveryCatalogSource => Boolean(item)),
    ).slice(0, 10)
    : [];

  const universe = candidateResult.status === 'fulfilled'
    ? (candidateResult.value ?? [])
      .map(mapUniverseCandidate)
      .filter((item): item is DiscoveryUniverseCandidate => Boolean(item))
      .map((item) => ({ item, score: scoreUniverseCandidate(profile, item) }))
      .filter(({ score }) => Number.isFinite(score) && score >= 2.3)
      .sort((a, b) => b.score - a.score || Number(b.item.confidence) - Number(a.item.confidence))
      .slice(0, 50)
      .map(({ item }) => item)
    : [];

  return {
    sources,
    universe,
    sourceCatalogLoaded: sourceResult.status === 'fulfilled',
    candidateUniverseLoaded: candidateResult.status === 'fulfilled',
  };
}
