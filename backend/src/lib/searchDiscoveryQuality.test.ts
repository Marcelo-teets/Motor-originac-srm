import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscoveryEntityHits } from './discoveryEntityNormalization.js';
import { filterDiscoveryHitsByProfileRelevance } from './discoveryRelevance.js';
import { findBestCompanyMatch } from './companyDiscoveryMatching.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';
import type { SearchProfile } from '../types/platform.js';

const hit = (companyName: string, overrides: Partial<DiscoverySourceHit> = {}): DiscoverySourceHit => ({
  companyName,
  sourceRef: 'google-news-rss',
  evidenceSummary: `${companyName} — evidência`,
  confidence: 0.62,
  rawPayload: {},
  ...overrides,
});

const profile = (
  targetStructure: string,
  userQuery: string,
): SearchProfile => ({
  id: 'sp-v10',
  name: 'Teste V10',
  segment: 'Fintech',
  subsegment: 'Crédito PME',
  companyType: 'Plataforma',
  geography: 'Brasil',
  creditProduct: 'Crédito PME',
  receivables: ['Duplicatas'],
  targetStructure,
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status: 'active',
  profilePayload: {
    mode: 'quick-search',
    userQuery,
  },
});

test('normalizes malformed headline subjects into reviewable company identities', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Asaas faz 2º FIDC e'),
    hit('CloudWalk, dona da InfinitePay'),
    hit('FIDCs no agronegócio: Basf'),
    hit('Mercado de Recebíveis conclui'),
    hit('Fintech de energia solar, Solfácil'),
    hit('Provu, ex-Lendico'),
    hit('Antecipação de recebíveis: Stone'),
    hit('Gigante de recebíveis, fintech Monkey'),
    hit('Koin, da Decolar'),
    hit('CredMei, de antecipação de recebíveis'),
    hit('a55 "pivota" e'),
    hit('Portobello "assenta" uma'),
  ]);

  assert.deepEqual(
    result.hits.map((item) => item.companyName).sort(),
    [
      'Asaas',
      'Basf',
      'CloudWalk',
      'CredMei',
      'Koin',
      'Mercado de Recebíveis',
      'Monkey',
      'Portobello',
      'Provu',
      'Solfácil',
      'Stone',
      'a55',
    ].sort(),
  );
  assert.equal(result.rejected, 0);
  assert.ok(result.rewritten >= 12);
});

test('rejects editorial themes, public bodies and generic subjects that are not companies', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Open Finance'),
    hit('Tendências'),
    hit('Agência de Comunicação'),
    hit('Mercado'),
    hit('Antecipação de recebíveis'),
    hit('Fintech de recebíveis públicos'),
    hit('Fomento mercantil'),
    hit('Brasileiro'),
    hit('Notícias'),
    hit('Empresa de tecnologia'),
    hit('Crescimento dos FIDCs'),
    hit('Empresa de antecipação de recebíveis'),
    hit('Banco Central'),
    hit('Pioneira em Antecipação de Recebíveis'),
    hit('Quatro das cinco maiores'),
    hit('Crédito privado ganha espaço e'),
    hit('Securitização ganha espaço e'),
    hit('O FIDC na reforma tributária'),
    hit('Presidente do SINFAC'),
    hit('Após rescisão de contrato, PMT'),
    hit('Governo Trump'),
    hit('Agradecimento'),
    hit('Regime Fácil abre espaço para'),
    hit('Renda fixa: crédito privado'),
  ]);

  assert.equal(result.hits.length, 0);
  assert.equal(result.rejected, 24);
});

test('splits a partnership headline into two company candidates', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Celcoin e Recargapay firmam parceria'),
  ]);

  assert.deepEqual(result.hits.map((item) => item.companyName).sort(), ['Celcoin', 'Recargapay']);
  assert.equal(result.expanded, 1);
});

test('promotes a real catalog source while preserving Google News as transport', () => {
  const [normalized] = normalizeDiscoveryEntityHits([
    hit('Ume', {
      rawPayload: {
        corroboratingSources: ['google-news-rss', 'src_finsiders_rss'],
      },
    }),
  ]).hits;

  assert.equal(normalized?.sourceRef, 'src_finsiders_rss');
  assert.equal(normalized?.rawPayload.transportSourceRef, 'google-news-rss');
  assert.equal(normalized?.rawPayload.sourceIdentityPromotedFromCorroboration, true);
});

test('relevance gate keeps FIDC/receivables evidence and removes unrelated company news', () => {
  const fidcProfile = profile('FIDC', 'Empresas com recebíveis que podem ter fit para FIDC');
  const normalized = normalizeDiscoveryEntityHits([
    hit('CloudWalk', { evidenceSummary: 'CloudWalk capta R$ 3,14 bi para antecipação de recebíveis.' }),
    hit('Basf', { evidenceSummary: 'Basf capta R$ 800 milhões via FIDC para financiar insumos rurais.' }),
    hit('Mercado Livre', { evidenceSummary: 'Mercado Livre capta R$ 1,07 bilhão com fundo de recebíveis para capital de giro.' }),
    hit('Afya', { evidenceSummary: 'Afya cria solução de antecipação de recebimento no cartão de crédito.' }),
    hit('Indicium', { evidenceSummary: 'Indicium lança diagnóstico gratuito de prontidão em IA.' }),
    hit('Uber', { evidenceSummary: 'Uber anuncia expansão com novo campus para trabalho híbrido.' }),
    hit('Caixa de Correio Inteligente', { evidenceSummary: 'Empresa cria solução para recebimento de encomendas em condomínios.' }),
    hit('Tigre', { evidenceSummary: 'Tigre vende 25% de seu capital a fundo de investimentos.' }),
  ]);

  const result = filterDiscoveryHitsByProfileRelevance(fidcProfile, normalized.hits);
  assert.deepEqual(
    result.hits.map((item) => item.companyName).sort(),
    ['Afya', 'Basf', 'CloudWalk', 'Mercado Livre'].sort(),
  );
  assert.equal(result.rejected, 4);
  assert.ok(result.hits.every((item) => (item.rawPayload.relevanceGate as { version?: string })?.version === 'v10'));
});

test('DCM relevance rejects generic readiness news and keeps debt/capital-market evidence', () => {
  const dcmProfile = profile('Debênture', 'Empresas com sinais de prontidão para DCM');
  const result = filterDiscoveryHitsByProfileRelevance(dcmProfile, [
    hit('Indicium', { evidenceSummary: 'Indicium lança diagnóstico de prontidão em IA para grandes empresas.' }),
    hit('Portobello', { evidenceSummary: 'Portobello faz captação de R$ 160 milhões com Caixa e BV.' }),
    hit('Empresa X', { evidenceSummary: 'Empresa X prepara emissão de debêntures no mercado de capitais.' }),
  ]);

  assert.deepEqual(result.hits.map((item) => item.companyName).sort(), ['Empresa X', 'Portobello'].sort());
  assert.equal(result.rejected, 1);
});

test('portfolio universe bypass is allowed only when the user explicitly asks for that universe', () => {
  const portfolioHit = hit('Creditas', {
    sourceRef: 'vc-portfolio:kaszek',
    evidenceSummary: 'Listada no portfólio público de Kaszek.',
    rawPayload: { origin: 'vc_portfolio_page' },
  });

  const regular = filterDiscoveryHitsByProfileRelevance(
    profile('FIDC', 'Fintechs com potencial para FIDC'),
    [portfolioHit],
  );
  assert.equal(regular.hits.length, 0);

  const explicit = filterDiscoveryHitsByProfileRelevance(
    profile('FIDC', 'Startups investidas por VCs com potencial para FIDC'),
    [portfolioHit],
  );
  assert.equal(explicit.hits.length, 1);
  assert.equal((explicit.hits[0]?.rawPayload.relevanceGate as { rule?: string })?.rule, 'explicit_portfolio_universe_intent');
});

test('entity resolution auto-links only exact normalized names, domains or CNPJ', () => {
  const companies = [
    { id: 'creditas', name: 'Creditas', cnpj: '17770708000124', website: 'https://www.creditas.com' },
    { id: 'asaas', name: 'Asaas', cnpj: '05366182000136', website: 'https://asaas.com' },
  ];

  assert.equal(findBestCompanyMatch({ companyName: 'Tendências' }, companies), null);
  assert.equal(findBestCompanyMatch({ companyName: 'Creditas' }, companies)?.companyId, 'creditas');
  assert.equal(findBestCompanyMatch({ companyName: 'Creditas Soluções' }, companies), null);
  assert.equal(findBestCompanyMatch({ companyName: 'Outra', website: 'https://www.creditas.com/produto' }, companies)?.matchMethod, 'website');
  assert.equal(findBestCompanyMatch({ companyName: 'Outra', cnpj: '17770708000124' }, companies)?.matchMethod, 'cnpj');
});
