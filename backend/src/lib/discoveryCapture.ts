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

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const decodeCdata = (value: string) => value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();

const headlineAction = /\b(lança|lancou|lançou|anuncia|anunciou|capta|captou|levanta|levantou|recebe|recebeu|cresce|cresceu|compra|comprou|vende|vendeu|estrutura|estruturam|estruturou|mira|prepara|busca|amplia|acelera|expande|fecha|raises|raised|secures|secured|launches|announces|acquires|acquired)\b/i;
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

const pickCompanyNameFromTitle = (title: string) => {
  const publisherRemoved = title.split(' - ')[0]?.trim() ?? title;
  const pipeRemoved = publisherRemoved.split(' | ')[0]?.trim() ?? publisherRemoved;
  const actionMatch = headlineAction.exec(pipeRemoved);
  const candidate = (actionMatch?.index ? pipeRemoved.slice(0, actionMatch.index) : pipeRemoved).trim().replace(/[,:;–—-]+$/, '').trim();
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return '';
  if (genericHeadlineSubjects.has(normalizeText(candidate))) return '';
  return candidate;
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

const runNewsDiscovery = async (profile: SearchProfile): Promise<DiscoverySourceHit[]> => {
  const url = googleNewsSearchUrl(profile);
  const response = await fetch(url, {
    headers: {
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`Google News RSS indisponível (${response.status}).`);
  const xml = await response.text();
  return parseGoogleNewsRss(xml)
    .map((item) => ({ ...item, sourceUrl: item.sourceUrl || url }))
    .slice(0, 25);
};

const quickSearchNeedsPortfolioUniverse = (query: string) => /\b(portf[oó]lio|portfolio|venture|vc|investida|investidas|startup|startups|tech-backed)\b/i.test(query);

export async function runSearchProfileDiscovery(profile: SearchProfile): Promise<DiscoverySourceHit[]> {
  const userQuery = quickSearchQuery(profile);
  const includePortfolioUniverse = !userQuery || quickSearchNeedsPortfolioUniverse(userQuery);

  const [newsResult, portfolioResult] = await Promise.allSettled([
    runNewsDiscovery(profile),
    includePortfolioUniverse ? discoverVcPortfolioCompanies() : Promise.resolve([] as DiscoverySourceHit[]),
  ]);

  const newsHits = newsResult.status === 'fulfilled' ? newsResult.value : [];
  const portfolioHits = portfolioResult.status === 'fulfilled' ? portfolioResult.value : [];

  if (newsResult.status === 'rejected' && portfolioHits.length === 0) {
    const reason = newsResult.reason instanceof Error ? newsResult.reason.message : 'Falha desconhecida no Google News RSS.';
    throw new Error(`Discovery indisponível: ${reason} Nenhuma fonte alternativa respondeu com candidatos relevantes.`);
  }

  return [...newsHits, ...portfolioHits.slice(0, 30)];
}
