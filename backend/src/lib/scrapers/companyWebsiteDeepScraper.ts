import type { B2BSignalPackResult, ScrapedPage, ScraperConnectorStatus } from './originationScraperTypes.js';
import { classifyWebsitePath, detectSignals, extractHeadings, extractTitle, sanitizeHtml } from './originationSignalDetectors.js';
import { mapWithConcurrency } from '../helpers.js';

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

const PAGE_FETCH_TIMEOUT_MS = 8_000;
const MAX_PAGE_BYTES = 1_500_000;
const PAGE_FETCH_CONCURRENCY = 5;
const MAX_PAGES = 10;

// Third-party sites: bound both the wait and the body we are willing to buffer.
const readPageHtml = async (url: string) => {
  const response = await fetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  if (Number(response.headers.get('content-length') ?? 0) > MAX_PAGE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  return (await response.text()).slice(0, MAX_PAGE_BYTES);
};

const fetchPage = async (url: string, baseUrl: string): Promise<ScrapedPage | null> => {
  try {
    const html = await readPageHtml(url);
    if (html === null) return null;
    const title = extractTitle(html);
    const headings = extractHeadings(html);
    const rawText = sanitizeHtml(html).slice(0, 12000);
    // Only the bare site URL is the homepage; candidate paths are classified by
    // pathname so a host like newscorp.com is not mistaken for a newsroom.
    const pageType = url === baseUrl ? 'homepage' : classifyWebsitePath(new URL(url).pathname);

    return {
      url,
      pageType,
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

  const settled = await mapWithConcurrency(urls, PAGE_FETCH_CONCURRENCY, (url) => fetchPage(url, baseUrl));
  const pages = settled.filter((page): page is ScrapedPage => Boolean(page)).slice(0, MAX_PAGES);

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
