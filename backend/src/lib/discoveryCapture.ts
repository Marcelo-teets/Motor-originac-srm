import type { SearchProfile } from '../types/platform.js';

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

export const buildDiscoveryQuery = (profile: SearchProfile) => {
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

const pickCompanyNameFromTitle = (title: string) => {
  const firstPass = title.split(' - ')[0]?.trim() ?? title;
  const secondPass = firstPass.split(' | ')[0]?.trim() ?? firstPass;
  return secondPass;
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

export async function runSearchProfileDiscovery(profile: SearchProfile): Promise<DiscoverySourceHit[]> {
  const url = googleNewsSearchUrl(profile);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      },
    });

    if (!response.ok) return [];
    const xml = await response.text();
    return parseGoogleNewsRss(xml)
      .map((item) => ({ ...item, sourceUrl: item.sourceUrl || url }))
      .slice(0, 25);
  } catch {
    return [];
  }
}
