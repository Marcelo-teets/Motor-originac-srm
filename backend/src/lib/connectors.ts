import type { CompanySeed, MonitoringOutput, SourceCatalogEntry } from '../types/platform.js';

const sanitizeText = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchBrasilApiCompany(cnpj: string) {
  const endpoint = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
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
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g)].slice(0, 5).map((match) => ({
      title: sanitizeText(match[1]),
      link: sanitizeText(match[2]),
      publishedAt: sanitizeText(match[3]),
    }));
    return { status: 'real' as const, items };
  } catch (error) {
    return { status: 'partial' as const, items: [{ title: 'RSS fallback', link: feedUrl, publishedAt: new Date().toUTCString(), error: error instanceof Error ? error.message : 'unknown_error' }] };
  }
}

export async function monitorCompanyWebsite(url: string) {
  try {
    const response = await fetch(url, { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`Website status ${response.status}`);
    const html = await response.text();
    const title = sanitizeText(html.match(/<title>(.*?)<\/title>/i)?.[1] ?? 'homepage');
    const headings = [...html.matchAll(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/gi)].slice(0, 3).map((match) => sanitizeText(match[1]));
    return { status: 'real' as const, title, headings };
  } catch (error) {
    return { status: 'partial' as const, title: 'website_fallback', headings: [error instanceof Error ? error.message : 'unreachable'] };
  }
}

export async function buildMonitoringOutputs(companies: CompanySeed[], sources: SourceCatalogEntry[]): Promise<MonitoringOutput[]> {
  const sourceByName = Object.fromEntries(sources.map((source) => [source.id, source]));
  const items = await Promise.all(
    companies.flatMap((company) => [
      (async () => {
        const website = await monitorCompanyWebsite(company.website);
        return {
          id: `${company.id}_website`,
          companyId: company.id,
          sourceId: 'src_company_website',
          title: `Website monitor · ${website.title}`,
          summary: website.headings.join(' | ') || 'Sem headings capturados.',
          collectedAt: new Date().toISOString(),
          confidenceScore: website.status === 'real' ? 0.73 : 0.45,
          connectorStatus: website.status,
          normalizedPayload: website,
        } satisfies MonitoringOutput;
      })(),
      (async () => {
        const rss = await fetchRssFeed(`https://news.google.com/rss/search?q=${encodeURIComponent(company.tradeName)}`);
        return {
          id: `${company.id}_rss`,
          companyId: company.id,
          sourceId: 'src_google_news_rss',
          title: `RSS monitor · ${company.tradeName}`,
          summary: rss.items.map((item) => item.title).join(' | '),
          collectedAt: new Date().toISOString(),
          confidenceScore: rss.status === 'real' ? 0.69 : 0.4,
          connectorStatus: rss.status,
          normalizedPayload: { items: rss.items, source: sourceByName['src_google_news_rss']?.name },
        } satisfies MonitoringOutput;
      })(),
      (async () => {
        const brasilApi = await fetchBrasilApiCompany(company.cnpj);
        return {
          id: `${company.id}_brasilapi`,
          companyId: company.id,
          sourceId: 'src_brasilapi_cnpj',
          title: `BrasilAPI CNPJ · ${company.tradeName}`,
          summary: `Status ${brasilApi.status} para ${company.cnpj}`,
          collectedAt: new Date().toISOString(),
          confidenceScore: brasilApi.status === 'real' ? 0.86 : 0.5,
          connectorStatus: brasilApi.status,
          normalizedPayload: brasilApi.data as Record<string, unknown>,
        } satisfies MonitoringOutput;
      })(),
    ]),
  );

  return items;
}
