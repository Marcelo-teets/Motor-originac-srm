import type { B2BSignalPackResult, ScrapedPage, ScraperConnectorStatus } from './originationScraperTypes.js';
import { detectSignals, extractHeadings, extractTitle, sanitizeHtml } from './originationSignalDetectors.js';

const withProtocol = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

const inferCompanyPath = (companyName: string) => {
  const slug = companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/company/${slug}/`;
};

const extractMeta = (html: string, property: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ?? '';

const extractJsonLdTexts = (html: string) =>
  [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => sanitizeHtml(match[1] ?? ''))
    .filter(Boolean);

const parseCount = (value: string) => {
  const normalized = value
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const creditRoleKeywords = [
  'analista de crédito',
  'gerente de crédito',
  'head of credit',
  'credit analyst',
  'credit risk',
  'underwriting',
  'underwriter',
  'collections',
  'cobrança',
  'risk manager',
  'tesouraria',
  'treasury',
  'capital markets',
  'mercado de capitais',
];

const normalizePlain = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const extractLinkedInMetrics = (text: string) => {
  const compactText = text.replace(/\s+/g, ' ');
  const followersMatch = compactText.match(/([\d.,]+)\s+(?:followers|seguidores)/i);
  const employeesMatch = compactText.match(/([\d.,]+)\s+(?:employees|funcion[aá]rios)/i);
  const employeeRangeMatch = compactText.match(/(\d{1,3}(?:[.,]\d{3})?\+?\s*-\s*\d{1,3}(?:[.,]\d{3})?\+?)\s+(?:employees|funcion[aá]rios)/i);
  const normalized = normalizePlain(compactText);
  const creditKeywordHits = creditRoleKeywords.filter((keyword) => normalized.includes(normalizePlain(keyword)));

  return {
    followersCount: followersMatch ? parseCount(followersMatch[1] ?? '') : null,
    employeeCount: employeesMatch ? parseCount(employeesMatch[1] ?? '') : null,
    employeeCountRange: employeeRangeMatch?.[1] ?? null,
    creditRelatedKeywordHits: creditKeywordHits.length,
    creditRelatedKeywords: creditKeywordHits,
    metricsConfidence: followersMatch || employeesMatch || employeeRangeMatch || creditKeywordHits.length ? 0.68 : 0.35,
  };
};

export const scrapeProfessionalNetworkCompany = async (params: {
  companyId: string;
  companyName: string;
  baseUrl?: string | null;
  companyUrl?: string | null;
}): Promise<B2BSignalPackResult> => {
  const collectedAt = new Date().toISOString();
  const baseUrl = withProtocol(params.baseUrl?.trim() || 'https://www.linkedin.com');
  const targetUrl = withProtocol(params.companyUrl?.trim() || `${baseUrl.replace(/\/$/, '')}${inferCompanyPath(params.companyName)}`);

  let page: ScrapedPage | null = null;
  let connectorStatus: ScraperConnectorStatus = 'partial';
  let metadata: Record<string, unknown> = { requestedUrl: targetUrl, networkBaseUrl: baseUrl };

  try {
    const response = await fetch(targetUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0',
      },
    });

    if (response.ok) {
      const html = await response.text();
      const title = extractTitle(html);
      const headings = extractHeadings(html);
      const description = extractMeta(html, 'description') || extractMeta(html, 'og:description');
      const jsonLdTexts = extractJsonLdTexts(html);
      const rawText = sanitizeHtml([title, description, ...headings, ...jsonLdTexts].join(' | ')).slice(0, 12000);
      const linkedinMetrics = extractLinkedInMetrics(rawText);

      page = {
        url: targetUrl,
        pageType: 'linkedin_company',
        title,
        headings,
        excerpt: rawText.slice(0, 280),
        rawText,
        status: 'real',
      };

      connectorStatus = 'real';
      metadata = {
        ...metadata,
        finalUrl: response.url,
        extractedDescription: description,
        linkedinMetrics,
        historicalMetricKeys: [
          'linkedin_followers_count',
          'linkedin_employee_count',
          'linkedin_employee_count_range',
          'linkedin_credit_related_keyword_hits',
        ],
        snapshotTables: ['company_source_metric_snapshots', 'company_linkedin_role_snapshots'],
      };
    }
  } catch {
    connectorStatus = 'partial';
  }

  const pages = page ? [page] : [];
  const consolidatedText = page?.rawText ?? '';
  const signals = page ? detectSignals([page.title, ...page.headings, page.rawText].join(' '), targetUrl, 'linkedin_company') : [];

  return {
    companyId: params.companyId,
    companyName: params.companyName,
    sourceId: 'src_professional_network_company',
    sourceType: 'linkedin_company',
    connectorStatus,
    collectedAt,
    pages,
    consolidatedText,
    signals,
    metadata,
  };
};
