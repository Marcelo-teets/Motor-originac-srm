import { sanitizeHtml } from './scrapers/originationSignalDetectors.js';

export type VcPortfolioConfig = {
  fund: string;
  url: string;
};

export type VcPortfolioPage = VcPortfolioConfig & {
  text: string;
  html: string;
};

// Páginas públicas de portfólio de fundos atuantes no Brasil; sobreponível por
// fonte via metadata.portfolios. URLs mudam com o tempo — falhas degradam para
// página ausente sem quebrar a captura.
export const DEFAULT_VC_PORTFOLIOS: VcPortfolioConfig[] = [
  { fund: 'Kaszek', url: 'https://www.kaszek.com/companies' },
  { fund: 'Monashees', url: 'https://monashees.com.br/en/portfolio' },
  { fund: 'Canary', url: 'https://canary.com.br/portfolio' },
  { fund: 'Astella', url: 'https://www.astella.com.br/portfolio' },
  { fund: 'Valor Capital Group', url: 'https://valorcapitalgroup.com/portfolio' },
];

export const parsePortfoliosMetadata = (value: unknown): VcPortfolioConfig[] => {
  if (!Array.isArray(value)) return DEFAULT_VC_PORTFOLIOS;
  const parsed = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const fund = typeof record.fund === 'string' ? record.fund.trim() : '';
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      if (!fund || !/^https?:\/\//i.test(url)) return null;
      return { fund, url } satisfies VcPortfolioConfig;
    })
    .filter((entry): entry is VcPortfolioConfig => Boolean(entry));
  return parsed.length ? parsed : DEFAULT_VC_PORTFOLIOS;
};

export async function fetchPortfolioPage(config: VcPortfolioConfig): Promise<VcPortfolioPage | null> {
  try {
    const response = await fetch(config.url, { headers: { accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok) return null;
    const html = await response.text();
    const text = sanitizeHtml(html).slice(0, 60000);
    if (!text) return null;
    return { ...config, text, html: html.slice(0, 200000) };
  } catch {
    return null;
  }
}
