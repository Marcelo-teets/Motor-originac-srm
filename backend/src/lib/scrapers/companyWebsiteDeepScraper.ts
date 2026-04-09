import type { B2BSignalPackResult, ScrapedPage, ScraperConnectorStatus } from './originationScraperTypes.js';
import { classifyWebsitePath, detectSignals, extractHeadings, extractTitle, sanitizeHtml } from './originationSignalDetectors.js';

const candidatePaths = [
  '',
  '/about',
  '/sobre',
  '/products',
  '/produto',
  '/solucoes',
  '/solutions',
  '/enterprise',
  '/business',
  '/empresas',
  '/partners',
  '/parceiros',
  '/pricing',
  '/precos',
  '/blog',
  '/newsroom',
  '/noticias',
  '/press',
  '/careers',
  '/carreiras',
  '/jobs',
  '/vagas',
  '/docs',
  '/developers',
  '/faq',
];

const unique = <T>(values: T[]) => [...new Set(values)];

const normalizeBaseUrl = (website: string) => {
  const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return withProtocol.replace(/\/$/, '');
};

const fetchPage = async (url: string): Promise<ScrapedPage | null> => {
  try {
    const response = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) return null;
    const html = await response.text();
    const title = extractTitle(html);
    const headings = extractHeadings(html);
    const rawText = sanitizeHtml(html).slice(0, 12000);
    const pageType = url === url.replace(/\/$/, '') ? 'homepage' : classifyWebsitePath(url);

    return {
      url,
      pageType: pageType === 'unknown' && /\/\/?$/.test(url) ? 'homepage' : pageType,
      title,
      headings,
      excerpt: rawText.slice(0, 280),
      rawText,
      status: 'real',
    };
  } catch {
    return null;
  }
};

export const scrapeCompanyWebsiteDeep = async (params: {
  companyId: string;
  companyName: string;
  website: string;
}): Promise<B2BSignalPackResult> => {
  const collectedAt = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(params.website);
  const urls = unique(candidatePaths.map((path) => `${baseUrl}${path}`));

  const settled = await Promise.all(urls.map((url) => fetchPage(url)));
  const pages = settled.filter((page): page is ScrapedPage => Boolean(page)).slice(0, 10);

  const connectorStatus: ScraperConnectorStatus = pages.length ? 'real' : 'partial';
  const consolidatedText = pages
    .map((page) => [page.title, ...page.headings, page.rawText].filter(Boolean).join(' | '))
    .join('\n');

  const signals = pages.flatMap((page) =>
    detectSignals([page.title, ...page.headings, page.rawText].join(' '), page.url, 'company_website'),
  );

  return {
    companyId: params.companyId,
    companyName: params.companyName,
    sourceId: 'src_company_website_deep',
    sourceType: 'company_website',
    connectorStatus,
    collectedAt,
    pages,
    consolidatedText,
    signals,
    metadata: {
      baseUrl,
      pagesVisited: pages.length,
      candidatePaths: urls.length,
      visitedPageTypes: unique(pages.map((page) => page.pageType)),
    },
  };
};
