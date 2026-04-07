import type { DetectedSignal } from './originationScraperTypes.js';

const keywordFamilies: Array<{ type: string; strength: number; keywords: string[] }> = [
  {
    type: 'b2b_distribution_signal',
    strength: 68,
    keywords: ['b2b', 'business', 'empresas', 'enterprise', 'corporate', 'middle market'],
  },
  {
    type: 'enterprise_go_to_market_signal',
    strength: 74,
    keywords: ['enterprise sales', 'inside sales', 'parceiros', 'partners', 'channel', 'revenda', 'plataforma b2b'],
  },
  {
    type: 'credit_product_signal',
    strength: 86,
    keywords: ['crédito', 'credito', 'financiamento', 'capital de giro', 'working capital', 'lending', 'loan'],
  },
  {
    type: 'receivables_signal',
    strength: 88,
    keywords: ['recebíveis', 'recebiveis', 'antecipação', 'antecipacao', 'invoice', 'duplicata', 'parcelado'],
  },
  {
    type: 'embedded_finance_signal',
    strength: 84,
    keywords: ['embedded finance', 'banking as a service', 'wallet', 'pix', 'checkout', 'pagamentos', 'payments'],
  },
  {
    type: 'collections_stack_signal',
    strength: 78,
    keywords: ['cobrança', 'cobranca', 'collections', 'recovery', 'renegociação', 'renegociacao'],
  },
  {
    type: 'underwriting_risk_signal',
    strength: 80,
    keywords: ['underwriting', 'risk', 'fraude', 'fraud', 'motor de decisão', 'decision engine', 'credit policy'],
  },
  {
    type: 'growth_hiring_signal',
    strength: 70,
    keywords: ['careers', 'carreiras', 'jobs', 'vagas', 'hiring', 'estamos contratando'],
  },
  {
    type: 'regional_expansion_signal',
    strength: 72,
    keywords: ['expansão', 'expansao', 'nova região', 'nova regiao', 'new market', 'latam', 'brasil inteiro'],
  },
  {
    type: 'partner_ecosystem_signal',
    strength: 69,
    keywords: ['partners', 'parceiros', 'ecossistema', 'integradores', 'network of partners'],
  },
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const sanitizeHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

export const extractTitle = (html: string) => html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ?? '';

export const extractHeadings = (html: string) =>
  [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)]
    .map((match) => sanitizeHtml(match[1] ?? ''))
    .filter(Boolean)
    .slice(0, 12);

export const detectSignals = (
  text: string,
  sourceUrl: string,
  sourceType: 'company_website' | 'linkedin_company',
): DetectedSignal[] => {
  const normalized = normalize(text);
  const evidenceLines = text.split(/(?<=[\.!?])\s+/).filter(Boolean);

  return keywordFamilies
    .map((family) => {
      const matchedKeywords = family.keywords.filter((keyword) => normalized.includes(normalize(keyword)));
      if (!matchedKeywords.length) return null;

      const evidence = evidenceLines
        .filter((line) => matchedKeywords.some((keyword) => normalize(line).includes(normalize(keyword))))
        .slice(0, 3);

      const confidenceBoost = Math.min(0.16, matchedKeywords.length * 0.03);

      return {
        type: family.type,
        strength: Math.min(95, family.strength + matchedKeywords.length * 2),
        confidenceScore: Math.min(0.9, 0.62 + confidenceBoost),
        matchedKeywords,
        evidence,
        sourceUrl,
        sourceType,
      } satisfies DetectedSignal;
    })
    .filter((item): item is DetectedSignal => Boolean(item));
};

export const classifyWebsitePath = (url: string) => {
  const value = normalize(url);
  if (value.includes('/about') || value.includes('/sobre')) return 'about';
  if (value.includes('/produto') || value.includes('/products') || value.includes('/solu')) return 'products';
  if (value.includes('/enterprise') || value.includes('/empresas') || value.includes('/business')) return 'enterprise';
  if (value.includes('/partners') || value.includes('/parceiros')) return 'partners';
  if (value.includes('/pricing') || value.includes('/precos')) return 'pricing';
  if (value.includes('/news') || value.includes('/blog') || value.includes('/press') || value.includes('/noticias')) return 'newsroom';
  if (value.includes('/careers') || value.includes('/carreiras') || value.includes('/jobs') || value.includes('/vagas')) return 'careers';
  if (value.includes('/docs') || value.includes('/developers') || value.includes('/faq')) return 'docs';
  return 'unknown';
};
