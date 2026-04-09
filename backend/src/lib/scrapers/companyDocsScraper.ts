import type { B2BSignalPackResult, ScrapedPage, ScraperConnectorStatus } from './originationScraperTypes.js';
import { detectSignals, extractHeadings, extractTitle, sanitizeHtml } from './originationSignalDetectors.js';

const paths = ['/docs', '/developers', '/faq', '/ajuda', '/api'];
const uniq = <T>(v: T[]) => [...new Set(v)];
const norm = (website: string) => (/^https?:\/\//i.test(website) ? website : `https://${website}`).replace(/\/$/, '');

async function fetchPage(url: string): Promise<ScrapedPage | null> {
  try {
    const r = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
    if (!r.ok) return null;
    const html = await r.text();
    const title = extractTitle(html);
    const headings = extractHeadings(html);
    const rawText = sanitizeHtml(html).slice(0, 10000);
    return { url, pageType: 'docs', title, headings, excerpt: rawText.slice(0, 280), rawText, status: 'real' };
  } catch { return null; }
}

export async function scrapeCompanyDocs(params: { companyId: string; companyName: string; website: string; }): Promise<B2BSignalPackResult> {
  const collectedAt = new Date().toISOString();
  const baseUrl = norm(params.website);
  const urls = uniq(paths.map((p) => `${baseUrl}${p}`));
  const settled = await Promise.all(urls.map(fetchPage));
  const pages = settled.filter((p): p is ScrapedPage => Boolean(p)).slice(0, 6);
  const connectorStatus: ScraperConnectorStatus = pages.length ? 'real' : 'partial';
  const consolidatedText = pages.map((p) => [p.title, ...p.headings, p.rawText].filter(Boolean).join(' | ')).join('\n');
  const signals = pages.flatMap((p) => detectSignals([p.title, ...p.headings, p.rawText].join(' '), p.url, 'company_website'));
  return { companyId: params.companyId, companyName: params.companyName, sourceId: 'src_company_docs', sourceType: 'company_website', connectorStatus, collectedAt, pages, consolidatedText, signals, metadata: { baseUrl, pagesVisited: pages.length, candidatePaths: urls.length, visitedPageTypes: ['docs'] } };
}
