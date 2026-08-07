import type { SearchProfile } from '../types/platform.js';
import { discoverVcPortfolioCompanies } from './vcPortfolioDiscovery.js';

export type DiscoverySourceHit = {
  companyName: string;
  website?: string;
  sourceRef: string;
  sourceUrl?: string;
  evidenceSummary: string;
  confidence: number;
  rawPayload: Record<string, unknown>;
};

export type DiscoveryQueryLane = {
  id: string;
  query: string;
};

export type DiscoveryLaneDiagnostic = {
  id: string;
  sourceRef: string;
  query?: string;
  status: 'fulfilled' | 'rejected';
  candidates: number;
  error?: string;
};

export type DiscoveryRunResult = {
  hits: DiscoverySourceHit[];
  lanes: DiscoveryLaneDiagnostic[];
};

const MAX_DISCOVERY_RESULTS = 60;
const MAX_NEWS_RESULTS_PER_LANE = 25;
const NEWS_TIMEOUT_MS = 4_500;

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const normalizeDomain = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
};

export const normalizeCompanyName = (value: string) =>
  normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const quickSearchQuery = (profile: SearchProfile) => {
  const value = profile.profilePayload?.userQuery;
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
};

const usefulPart = (value: string | undefined) => {
  const normalized = normalizeText(value ?? '');
  if (!normalized || normalized === 'unknown' || normalized === 'nao definido' || normalized === 'não definido') return '';
  return value?.trim() ?? '';
};

export const buildDiscoveryQuery = (profile: SearchProfile) => {
  const userQuery = quickSearchQuery(profile);
  if (userQuery) {
    const alreadyMentionsBrazil = /\b(brasil|brazil)\b/i.test(userQuery);
    return `${userQuery}${alreadyMentionsBrazil ? '' : ' Brasil'}`.trim();
  }

  const parts = [
    profile.segment,
    profile.subsegment,
    profile.creditProduct,
    profile.targetStructure,
    profile.companyType,
    profile.geography,
    'Brasil',
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const stripOutcomeQualifiers = (value: string) => value
  .replace(/\b(com potencial para|que podem ter fit para|fit para|que (?:est[aã]o )?crescendo|podem precisar de|precisando de|com sinais de|prontas? para|press[aã]o de capital|necessidade de funding|funding escal[aá]vel)\b/gi, ' ')
  .replace(/\b(fidcs?|dcm|deb[eê]ntures?|warehouse|nota comercial)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\b(e|ou|para|com)\s*$/i, '')
  .trim();

const structureTerms = (targetStructure: string) => {
  const normalized = normalizeText(targetStructure);
  if (normalized.includes('fidc')) return 'recebíveis FIDC securitização antecipação carteira crédito';
  if (normalized.includes('debent') || normalized.includes('dcm')) return 'debênture dívida captação emissão mercado de capitais';
  if (normalized.includes('warehouse')) return 'warehouse funding carteira crédito recebíveis';
  if (normalized.includes('nota comercial')) return 'nota comercial dívida captação crédito corporativo';
  if (normalized.includes('cri')) return 'CRI securitização recebíveis imobiliários';
  if (normalized.includes('cra')) return 'CRA securitização recebíveis agronegócio';
  return 'crédito dívida funding recebíveis';
};

const dedupeQueryLanes = (lanes: DiscoveryQueryLane[]) => {
  const seen = new Set<string>();
  return lanes.filter((lane) => {
    const key = normalizeText(lane.query).replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildDiscoveryQueries = (profile: SearchProfile): DiscoveryQueryLane[] => {
  const userQuery = quickSearchQuery(profile);
  const segment = usefulPart(profile.segment);
  const companyType = usefulPart(profile.companyType);
  const geography = usefulPart(profile.geography) || 'Brasil';

  const structuredSubject = [
    segment,
    usefulPart(profile.subsegment),
    usefulPart(profile.creditProduct),
    companyType,
  ].filter(Boolean).join(' ');

  const broadUserSubject = stripOutcomeQualifiers(userQuery);
  const broadSubject = broadUserSubject || (userQuery ? segment : structuredSubject) || 'empresas crédito';
  const exactQuery = buildDiscoveryQuery(profile);

  return dedupeQueryLanes([
    { id: 'direct', query: exactQuery },
    { id: 'universe', query: `${broadSubject} empresas ${geography}` },
    { id: 'credit', query: `${broadSubject} crédito financiamento recebíveis antecipação ${geography}` },
    { id: 'funding', query: `${broadSubject} captação dívida funding capital crescimento ${geography}` },
    { id: 'structure', query: `${broadSubject} ${structureTerms(profile.targetStructure)} ${geography}` },
  ]).slice(0, 5);
};

export const buildDiscoveryDedupeKey = (input: { companyName: string; website?: string; cnpj?: string }) => {
  if (input.cnpj) return `cnpj:${input.cnpj}`;
  const normalizedDomain = normalizeDomain(input.website);
  if (normalizedDomain) return `domain:${normalizedDomain}`;
  return `name:${normalizeCompanyName(input.companyName)}`;
};

export const googleNewsSearchUrl = (profile: SearchProfile) => {
  const q = encodeURIComponent(buildDiscoveryQuery(profile));
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
};

const googleNewsQueryUrl = (query: string) => {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
};

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const decodeCdata = (value: string) => value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();

const headlineAction = /\b(lança|lancou|lançou|anuncia|anunciou|capta|captou|levanta|levantou|recebe|recebeu|cresce|cresceu|compra|comprou|vende|vendeu|estrutura|estruturam|estruturou|mira|prepara|busca|amplia|acelera|expande|fecha|conclui|concluiu|obtém|obtem|obteve|garante|garantiu|cria|criou|planeja|planejou|contrata|contratou|raises|raised|secures|secured|launches|announces|acquires|acquired|closes|closed)\b/i;
const genericHeadlineSubjects = new Set([
  'empresas',
  'empresa',
  'gestoras',
  'gestora',
  'fintechs',
  'fintech',
  'startups',
  'startup',
  'mercado',
  'setor',
  'fundos',
  'fundo',
  'fidcs',
  'fidc',
]);
const genericThemePrefix = /^(fidcs?|cr[eé]dito|mercado|setor|fintechs?|startups?|agroneg[oó]cio|dcm|deb[eê]ntures?|receb[ií]veis|funding)\b/i;
const descriptorPrefix = /^(fintech|startup|empresa|plataforma|healthtech|agtech|insurtech|proptech|edtech)\b/i;
const genericRightSide = /^(banco|fintech|empresa|grupo|plataforma|setor|mercado)$/i;

const isPlausibleHeadlineCompanyName = (value: string) => {
  const candidate = value.trim();
  const words = candidate.split(/\s+/).filter(Boolean);
  if (candidate.length < 3 || candidate.length > 60 || words.length === 0 || words.length > 5) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(candidate)) return false;
  if (genericHeadlineSubjects.has(normalizeText(candidate))) return false;
  if (/^(como|por que|porque|entenda|veja|saiba|ranking|lista|especial|exclusivo)\b/i.test(candidate)) return false;
  return true;
};

const pickCompanyNameFromTitle = (title: string) => {
  const publisherRemoved = title.split(' - ')[0]?.trim() ?? title;
  const pipeRemoved = publisherRemoved.split(' | ')[0]?.trim() ?? publisherRemoved;
  const actionMatch = headlineAction.exec(pipeRemoved);
  let candidate = (actionMatch?.index ? pipeRemoved.slice(0, actionMatch.index) : pipeRemoved)
    .trim()
    .replace(/[,:;–—-]+$/, '')
    .trim();

  const aliasMatch = candidate.match(/^([^,]+),\s*(?:ex-|antig[oa]|antes|anteriormente)\b/i);
  if (aliasMatch?.[1]) candidate = aliasMatch[1].trim();

  if (candidate.includes(':')) {
    const parts = candidate.split(':').map((part) => part.trim()).filter(Boolean);
    const left = parts.slice(0, -1).join(': ').trim();
    const right = parts.at(-1) ?? '';
    if (genericThemePrefix.test(left) && isPlausibleHeadlineCompanyName(right)) candidate = right;
    else if (genericRightSide.test(right) && isPlausibleHeadlineCompanyName(left)) candidate = left;
  }

  if (candidate.includes(',')) {
    const parts = candidate.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && descriptorPrefix.test(parts[0] ?? '')) {
      const trailing = parts.at(-1) ?? '';
      if (isPlausibleHeadlineCompanyName(trailing)) candidate = trailing;
    }
  }

  candidate = candidate.replace(/[,:;–—-]+$/, '').trim();
  return isPlausibleHeadlineCompanyName(candidate) ? candidate : '';
};

export const parseGoogleNewsRss = (xml: string): DiscoverySourceHit[] => {
  const chunks = xml.split(/<item>/i).slice(1);

  return chunks.map((chunk) => {
    const titleMatch = chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const linkMatch = chunk.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '';
    const descriptionMatch = chunk.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '';

    const title = stripHtml(decodeCdata(titleMatch));
    const sourceUrl = stripHtml(decodeCdata(linkMatch));
    const description = stripHtml(decodeCdata(descriptionMatch));
    const companyName = pickCompanyNameFromTitle(title);

    return {
      companyName,
      sourceRef: 'google-news-rss',
      sourceUrl,
      evidenceSummary: `${title}. ${description}`.trim(),
      confidence: 0.62,
      rawPayload: {
        title,
        sourceUrl,
        description,
      },
    } satisfies DiscoverySourceHit;
  }).filter((item) => item.companyName.length >= 3);
};

const runNewsDiscoveryLane = async (lane: DiscoveryQueryLane): Promise<DiscoverySourceHit[]> => {
  const url = googleNewsQueryUrl(lane.query);
  const response = await fetch(url, {
    headers: {
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
    },
    signal: AbortSignal.timeout(NEWS_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Google News RSS indisponível (${response.status}) na lente ${lane.id}.`);
  const xml = await response.text();
  return parseGoogleNewsRss(xml)
    .map((item) => ({
      ...item,
      sourceUrl: item.sourceUrl || url,
      rawPayload: {
        ...item.rawPayload,
        discoveryLane: lane.id,
        discoveryQuery: lane.query,
      },
    }))
    .slice(0, MAX_NEWS_RESULTS_PER_LANE);
};

const quickSearchNeedsPortfolioUniverse = (query: string) => /\b(portf[oó]lio|portfolio|venture|vc|investida|investidas|startup|startups|tech-backed)\b/i.test(query);

const mergeDiscoveryHits = (hits: DiscoverySourceHit[]) => {
  const merged = new Map<string, DiscoverySourceHit>();

  for (const hit of hits) {
    const key = buildDiscoveryDedupeKey({ companyName: hit.companyName, website: hit.website });
    const existing = merged.get(key);
    if (!existing) {
      const lane = typeof hit.rawPayload.discoveryLane === 'string' ? hit.rawPayload.discoveryLane : undefined;
      merged.set(key, {
        ...hit,
        rawPayload: {
          ...hit.rawPayload,
          discoveryLanes: lane ? [lane] : [],
          corroboratedDiscoveryHits: 1,
        },
      });
      continue;
    }

    const existingLanes = Array.isArray(existing.rawPayload.discoveryLanes)
      ? existing.rawPayload.discoveryLanes.filter((item): item is string => typeof item === 'string')
      : [];
    const lane = typeof hit.rawPayload.discoveryLane === 'string' ? hit.rawPayload.discoveryLane : undefined;
    const discoveryLanes = Array.from(new Set([...existingLanes, ...(lane ? [lane] : [])]));
    const corroboratedDiscoveryHits = Number(existing.rawPayload.corroboratedDiscoveryHits ?? 1) + 1;
    const corroboratingEvidence = Array.from(new Set([
      ...(Array.isArray(existing.rawPayload.corroboratingEvidence)
        ? existing.rawPayload.corroboratingEvidence.filter((item): item is string => typeof item === 'string')
        : []),
      hit.evidenceSummary,
    ])).slice(0, 3);

    merged.set(key, {
      ...existing,
      confidence: Math.min(0.78, Math.max(existing.confidence, hit.confidence) + 0.04),
      rawPayload: {
        ...existing.rawPayload,
        discoveryLanes,
        corroboratedDiscoveryHits,
        corroboratingEvidence,
      },
    });
  }

  return Array.from(merged.values()).slice(0, MAX_DISCOVERY_RESULTS);
};

export async function runSearchProfileDiscovery(profile: SearchProfile): Promise<DiscoveryRunResult> {
  const userQuery = quickSearchQuery(profile);
  const lanes = buildDiscoveryQueries(profile);
  const includePortfolioUniverse = !userQuery || quickSearchNeedsPortfolioUniverse(userQuery);
  const portfolioPromise = includePortfolioUniverse
    ? discoverVcPortfolioCompanies()
    : Promise.resolve([] as DiscoverySourceHit[]);

  const settled = await Promise.allSettled([
    ...lanes.map((lane) => runNewsDiscoveryLane(lane)),
    portfolioPromise,
  ]);

  const newsResults = settled.slice(0, lanes.length) as PromiseSettledResult<DiscoverySourceHit[]>[];
  const portfolioResult = settled[lanes.length] as PromiseSettledResult<DiscoverySourceHit[]>;
  const diagnostics: DiscoveryLaneDiagnostic[] = lanes.map((lane, index) => {
    const result = newsResults[index];
    if (result?.status === 'fulfilled') {
      return { id: lane.id, sourceRef: 'google-news-rss', query: lane.query, status: 'fulfilled', candidates: result.value.length };
    }
    const reason = result?.status === 'rejected' && result.reason instanceof Error
      ? result.reason.message
      : 'Falha desconhecida no Google News RSS.';
    return { id: lane.id, sourceRef: 'google-news-rss', query: lane.query, status: 'rejected', candidates: 0, error: reason };
  });

  const newsHits = newsResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const portfolioHits = portfolioResult.status === 'fulfilled' ? portfolioResult.value : [];

  if (includePortfolioUniverse) {
    diagnostics.push(portfolioResult.status === 'fulfilled'
      ? { id: 'vc-portfolio', sourceRef: 'vc-portfolio', status: 'fulfilled', candidates: portfolioHits.length }
      : {
        id: 'vc-portfolio',
        sourceRef: 'vc-portfolio',
        status: 'rejected',
        candidates: 0,
        error: portfolioResult.reason instanceof Error ? portfolioResult.reason.message : 'Falha desconhecida no universo de VC.',
      });
  }

  const fulfilledNewsLanes = newsResults.filter((result) => result.status === 'fulfilled').length;
  if (fulfilledNewsLanes === 0 && portfolioHits.length === 0) {
    const firstFailure = diagnostics.find((lane) => lane.status === 'rejected')?.error ?? 'Nenhuma fonte respondeu.';
    throw new Error(`Discovery indisponível: ${firstFailure}`);
  }

  return {
    hits: mergeDiscoveryHits([...newsHits, ...portfolioHits.slice(0, 30)]),
    lanes: diagnostics,
  };
}
