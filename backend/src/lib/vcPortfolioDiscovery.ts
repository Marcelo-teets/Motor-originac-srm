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
  'about', 'about us', 'sobre', 'contact', 'contato', 'contact us', 'get in touch',
  'team', 'time', 'equipe', 'people', 'our team', 'our people', 'leadership',
  'home', 'menu', 'news', 'blog', 'jobs', 'careers', 'carreiras', 'vagas',
  'investors', 'investidores', 'fund', 'fundo', 'funds', 'fundos', 'exits', 'exit',
  'ver mais', 'saiba mais', 'read more', 'learn more', 'see all', 'view all', 'all companies',
  'privacy', 'privacidade', 'terms', 'termos', 'linkedin', 'twitter', 'instagram', 'follow us',
  'logo', 'icon', 'image', 'photo', 'newsletter', 'search', 'busca', 'apply', 'apply now',
  'kaszek', 'monashees', 'canary', 'astella', 'valor capital group', 'valor capital', 'valor',
  'founders', 'co-founders', 'our founders', 'of us', 'part of us', 'keep in touch',
  "let's keep in touch", 'summit', 'event', 'events', 'the team', 'our companies',
]);

// Nomes de fundos que aparecem como prefixo em alt-text tipo "Kaszek Creditas Logo".
const FUND_PREFIXES = ['kaszek', 'monashees', 'canary', 'astella', 'valor capital group', 'valor capital'];

const SOCIAL_OR_UTILITY_HOSTS = [
  'linkedin.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com',
  'youtube.com', 'youtu.be', 'medium.com', 'substack.com', 'mail.google.com',
];

export type PortfolioCompanyObservation = {
  companyName: string;
  website?: string;
  portfolioDetailUrl?: string;
};

const resolveUrl = (href: string, baseUrl: string) => {
  try {
    return new URL(href, baseUrl);
  } catch {
    return null;
  }
};

const normalizedHost = (value: string) => value.toLowerCase().replace(/^www\./, '');

const isExternalCompanyWebsite = (href: string, portfolioUrl: string) => {
  if (!href || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) return false;
  const resolved = resolveUrl(href, portfolioUrl);
  const portfolio = resolveUrl(portfolioUrl, portfolioUrl);
  if (!resolved || !portfolio || !/^https?:$/.test(resolved.protocol)) return false;
  const host = normalizedHost(resolved.hostname);
  if (!host || host === normalizedHost(portfolio.hostname)) return false;
  if (SOCIAL_OR_UTILITY_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return false;
  return true;
};

const decodeEntities = (value: string) => value
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ');

// Recupera o nome real a partir do ruído comum das páginas de portfólio:
// prefixo do fundo, sufixos "logo/logotipo", placeholders de imagem e
// manchetes de rodada ("Telepatia Raises $33M" -> "Telepatia").
const cleanCandidate = (value: string) => {
  let name = decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Placeholder de imagem sem alt.
  if (/image without alt|sem alt|no alt|placeholder/i.test(name)) return '';

  // Remove prefixo do fundo ("Kaszek Creditas Logo" -> "Creditas Logo").
  for (const fund of FUND_PREFIXES) {
    const prefix = new RegExp(`^${fund}\\s+`, 'i');
    if (prefix.test(name)) { name = name.replace(prefix, '').trim(); break; }
  }

  // Corta manchetes (captação, rodada, lançamento, M&A) preservando só o nome.
  name = name.replace(/\s+(raises|raised|secures|secured|closes|closed|announces|announced|launches|launched|lança|lançou|acquires|acquired|adquire|buys|bought|levanta|capta|captou|recebe|recebeu)\b.*/i, '').trim();
  // Remove marcadores de série/valor residuais.
  name = name.replace(/\s*[-–|]?\s*(series\s+[a-e]|série\s+[a-e]|\$[\d.,]+\s*[mkb]?|r\$[\d.,]+\s*[mkb]?)\b.*/i, '').trim();
  // Remove sufixos de mídia.
  name = name.replace(/\s+(logo|logotype|logotipo|icon|ícone|image|imagem|photo|foto)$/i, '').trim();

  return name;
};

const isPlausibleCompanyName = (value: string) => {
  if (value.length < MIN_NAME_LENGTH || value.length > MAX_NAME_LENGTH) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(value)) return false;
  if (/[<>{}[\]@#]/.test(value)) return false;
  if (value.split(' ').length > 5) return false;
  const lower = value.toLowerCase();
  if (STOPWORDS.has(lower)) return false;
  // Rejeita se todo o nome for uma palavra de mídia/navegação isolada já coberta,
  // ou se ainda contiver marcadores óbvios de ruído.
  if (/\b(logo|image|newsletter|cookie|subscribe|regulation|regulação|privacy policy)\b/i.test(lower)) return false;
  return true;
};

// Extrai candidatos de elementos estruturais onde páginas de portfólio listam
// investidas. Quando o próprio portfólio aponta para o domínio externo da
// investida, preservamos esse link como evidência first-party de identidade.
export const extractPortfolioCompanies = (html: string, portfolioUrl: string): PortfolioCompanyObservation[] => {
  const anchorEvidence = new Map<string, Omit<PortfolioCompanyObservation, 'companyName'>>();

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';
    const alt = body.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1] ?? '';
    const label = cleanCandidate(alt || body);
    if (!isPlausibleCompanyName(label)) continue;
    const resolved = resolveUrl(href, portfolioUrl);
    if (!resolved || !href) continue;
    anchorEvidence.set(label.toLowerCase(), {
      ...(isExternalCompanyWebsite(href, portfolioUrl)
        ? { website: resolved.toString() }
        : { portfolioDetailUrl: resolved.toString() }),
    });
  }

  // Preserve the historical extractor order (logo alt -> headings -> anchors).
  // Link evidence is attached by normalized company name and does not reorder
  // candidates, which keeps downstream dedupe/review behavior deterministic.
  const rawCandidates: string[] = [];
  for (const match of html.matchAll(/<img[^>]+alt=["']([^"']+)["']/gi)) rawCandidates.push(match[1] ?? '');
  for (const match of html.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)) rawCandidates.push(match[1] ?? '');
  for (const match of html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) rawCandidates.push(match[1] ?? '');

  const byName = new Map<string, PortfolioCompanyObservation>();
  for (const raw of rawCandidates) {
    const companyName = cleanCandidate(raw);
    if (!isPlausibleCompanyName(companyName)) continue;
    const key = companyName.toLowerCase();
    const evidence = anchorEvidence.get(key) ?? {};
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { companyName, ...evidence });
    } else {
      byName.set(key, {
        companyName: existing.companyName,
        website: existing.website ?? evidence.website,
        portfolioDetailUrl: existing.portfolioDetailUrl ?? evidence.portfolioDetailUrl,
      });
    }
    if (byName.size >= MAX_NAMES_PER_PAGE) break;
  }
  return [...byName.values()];
};

export const extractPortfolioCompanyNames = (html: string): string[] =>
  extractPortfolioCompanies(html, 'https://portfolio.invalid/').map((candidate) => candidate.companyName);

// Descoberta de universo a partir dos portfólios VC (fonte estratégica central
// do cérebro mestre). Os hits entram no fluxo padrão de candidatos: dedupe
// contra o universo existente, Capture Inbox e promoção humana — nada entra
// em companies automaticamente.
export async function discoverVcPortfolioCompanies(): Promise<DiscoverySourceHit[]> {
  const pages = await Promise.all(DEFAULT_VC_PORTFOLIOS.map((config) => fetchPortfolioPage(config)));

  return pages
    .filter((page): page is NonNullable<typeof page> => Boolean(page))
    .flatMap((page) =>
      extractPortfolioCompanies(page.html, page.url).map((candidate) => ({
        companyName: candidate.companyName,
        ...(candidate.website ? { website: candidate.website } : {}),
        sourceRef: `vc-portfolio:${page.fund}`,
        sourceUrl: page.url,
        evidenceSummary: candidate.website
          ? `Listada no portfólio público de ${page.fund}, que aponta para o domínio oficial da investida. Validar CNPJ e aderência à tese antes de promover.`
          : `Listada no portfólio público de ${page.fund}. Validar identidade, CNPJ e aderência à tese antes de promover.`,
        confidence: candidate.website ? 0.65 : 0.55,
        rawPayload: {
          origin: 'vc_portfolio_page',
          fund: page.fund,
          evidenceUrl: page.url,
          ...(candidate.website ? { portfolioCompanyWebsite: candidate.website, identityEvidenceKind: 'vc_portfolio_external_link' } : {}),
          ...(candidate.portfolioDetailUrl ? { portfolioDetailUrl: candidate.portfolioDetailUrl } : {}),
        },
      } satisfies DiscoverySourceHit)),
    );
}
