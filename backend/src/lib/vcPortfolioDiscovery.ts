import { DEFAULT_VC_PORTFOLIOS, fetchPortfolioPage } from './vcPortfolios.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';

const MAX_NAMES_PER_PAGE = 40;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 40;

// Palavras de navegação/institucionais que aparecem em qualquer página de
// portfólio e nunca são nome de investida. O Capture Inbox faz a revisão
// humana final, mas o extrator não deve inundá-lo de lixo óbvio.
const STOPWORDS = new Set([
  'portfolio', 'portfólio', 'companies', 'company', 'empresas', 'empresa',
  'about', 'about us', 'sobre', 'contact', 'contato', 'team', 'time', 'equipe',
  'home', 'menu', 'news', 'blog', 'jobs', 'careers', 'carreiras', 'vagas',
  'investors', 'investidores', 'fund', 'fundo', 'funds', 'fundos',
  'ver mais', 'saiba mais', 'read more', 'learn more', 'see all', 'view all',
  'privacy', 'privacidade', 'terms', 'termos', 'linkedin', 'twitter', 'instagram',
  'logo', 'icon', 'image', 'photo', 'newsletter', 'search', 'busca',
  'kaszek', 'monashees', 'canary', 'astella', 'valor capital group', 'valor capital',
]);

const decodeEntities = (value: string) => value
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ');

const cleanCandidate = (value: string) => decodeEntities(value)
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isPlausibleCompanyName = (value: string) => {
  if (value.length < MIN_NAME_LENGTH || value.length > MAX_NAME_LENGTH) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(value)) return false;
  if (/[<>{}[\]@#]/.test(value)) return false;
  if (value.split(' ').length > 5) return false;
  if (STOPWORDS.has(value.toLowerCase())) return false;
  return true;
};

// Extrai candidatos de elementos estruturais onde páginas de portfólio listam
// investidas: alt de logos, headings de card e texto de âncoras.
export const extractPortfolioCompanyNames = (html: string): string[] => {
  const candidates: string[] = [];

  for (const match of html.matchAll(/<img[^>]+alt=["']([^"']+)["']/gi)) {
    candidates.push(match[1] ?? '');
  }
  for (const match of html.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)) {
    candidates.push(match[1] ?? '');
  }
  for (const match of html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
    candidates.push(match[1] ?? '');
  }

  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of candidates) {
    const name = cleanCandidate(raw);
    if (!isPlausibleCompanyName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= MAX_NAMES_PER_PAGE) break;
  }
  return names;
};

// Descoberta de universo a partir dos portfólios VC (fonte estratégica central
// do cérebro mestre). Os hits entram no fluxo padrão de candidatos: dedupe
// contra o universo existente, Capture Inbox e promoção humana — nada entra
// em companies automaticamente.
export async function discoverVcPortfolioCompanies(): Promise<DiscoverySourceHit[]> {
  const pages = await Promise.all(DEFAULT_VC_PORTFOLIOS.map((config) => fetchPortfolioPage(config)));

  return pages
    .filter((page): page is NonNullable<typeof page> => Boolean(page))
    .flatMap((page) =>
      extractPortfolioCompanyNames(page.html).map((companyName) => ({
        companyName,
        sourceRef: `vc-portfolio:${page.fund}`,
        sourceUrl: page.url,
        evidenceSummary: `Listada no portfólio público de ${page.fund}. Validar identidade, CNPJ e aderência à tese antes de promover.`,
        confidence: 0.55,
        rawPayload: {
          origin: 'vc_portfolio_page',
          fund: page.fund,
          evidenceUrl: page.url,
        },
      } satisfies DiscoverySourceHit)),
    );
}
