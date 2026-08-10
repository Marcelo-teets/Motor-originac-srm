import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscoveryEntityHits } from './discoveryEntityNormalization.js';
import { filterDiscoveryHitsByProfileRelevance } from './discoveryRelevance.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';
import type { SearchProfile } from '../types/platform.js';

const hit = (companyName: string, evidenceSummary: string): DiscoverySourceHit => ({
  companyName,
  sourceRef: 'google-news-rss',
  evidenceSummary,
  confidence: 0.62,
  rawPayload: { title: evidenceSummary },
});

const profile = (overrides: Partial<SearchProfile> = {}): SearchProfile => ({
  id: 'v15-profile',
  name: 'V15 specific intent',
  segment: 'Fintech',
  subsegment: 'Crédito consignado',
  companyType: 'Originadora',
  geography: 'Brasil',
  creditProduct: 'Consignado',
  receivables: ['Folha'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 75,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status: 'active',
  profilePayload: {
    mode: 'quick-search',
    userQuery: 'Fintechs de consignado privado no Brasil que estão crescendo e podem precisar de FIDC',
  },
  ...overrides,
});

test('consignado privado requires evidence from the requested product universe', () => {
  const normalized = normalizeDiscoveryEntityHits([
    hit('afluent', 'Consignado privado cresce seis vezes; BCN impulsiona fintechs como afluent.'),
    hit('99', '99, Itaú e Nubank já oferecem consignado privado para trabalhadores CLT.'),
    hit('Zetra', 'Zetra amplia solução de crédito consignado CLT com desconto em folha.'),
    hit('Konsi', 'Konsi expande crédito do trabalhador e compara ofertas de consignado privado.'),
    hit('CloudWalk', 'CloudWalk capta recursos para antecipação de recebíveis e amplia FIDC.'),
    hit('goFlux', 'goFlux lança FIDC para financiar fretes do agro.'),
    hit('Afya', 'Afya cria antecipação de recebíveis de cartão para médicos.'),
    hit('Asaas', 'Asaas amplia carteira de crédito e captação via CDB.'),
  ]);

  const result = filterDiscoveryHitsByProfileRelevance(profile(), normalized.hits);
  assert.deepEqual(
    result.hits.map((item) => item.companyName).sort(),
    ['99', 'Konsi', 'Zetra', 'afluent'].sort(),
  );
  assert.equal(result.specificIntentRejected, 4);
  assert.ok(result.hits.every((item) => {
    const gate = item.rawPayload.relevanceGate as { version?: string; specificIntent?: string; specificIntentMatched?: boolean };
    return gate.version === 'v15' && gate.specificIntent === 'consignado_privado' && gate.specificIntentMatched === true;
  }));
});

test('generic FIDC/receivables searches preserve broad structural recall', () => {
  const broadProfile = profile({
    subsegment: 'Antecipação de recebíveis',
    creditProduct: 'Antecipação',
    receivables: ['Duplicatas'],
    profilePayload: { mode: 'quick-search', userQuery: 'Empresas com recebíveis que podem ter fit para FIDC' },
  });

  const normalized = normalizeDiscoveryEntityHits([
    hit('CloudWalk', 'CloudWalk capta R$ 3,14 bi para antecipação de recebíveis.'),
    hit('Basf', 'Basf capta R$ 800 milhões via FIDC para financiar insumos rurais.'),
    hit('Mercado Livre', 'Mercado Livre capta R$ 1,07 bilhão com fundo de recebíveis para capital de giro.'),
    hit('Indicium', 'Indicium lança diagnóstico gratuito de prontidão em IA.'),
  ]);

  const result = filterDiscoveryHitsByProfileRelevance(broadProfile, normalized.hits);
  assert.deepEqual(result.hits.map((item) => item.companyName).sort(), ['Basf', 'CloudWalk', 'Mercado Livre'].sort());
  assert.equal(result.specificIntentRejected, 0);
});

test('generic editorial subjects are rejected before product relevance is evaluated', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Produto para consignado privado', 'Produto para consignado privado cresce no Brasil.'),
    hit('Startups tentam escapar de', 'Startups tentam escapar de novas regras de crédito.'),
    hit('Acordo de Livre Comércio Mercosul', 'Acordo de Livre Comércio Mercosul avança.'),
    hit('Banco Central', 'Banco Central muda regra do consignado.'),
    hit('Câmara aprova nova taxação', 'Câmara aprova nova taxação de operações.'),
    hit('Crédito Privado', 'Crédito Privado ganha espaço.'),
    hit('Securitização', 'Securitização cresce no país.'),
    hit('Tem de ser assim', 'Tem de ser assim, dizem executivos.'),
    hit('Campanha', 'Campanha sobre crédito é lançada.'),
    hit('Concessões “colocam” Mato Grosso', 'Concessões colocam Mato Grosso no mapa.'),
  ]);

  assert.equal(result.hits.length, 0);
  assert.equal(result.rejected, 10);
});

test('headline-role normalization recovers brands before relevance filtering', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Fintech Starian anuncia carteira digital', 'Fintech Starian anuncia carteira digital.'),
    hit('Gigante no Brasil, PicPay oferece consignado privado', 'Gigante no Brasil, PicPay oferece consignado privado a CLTs.'),
  ]);

  assert.deepEqual(result.hits.map((item) => item.companyName).sort(), ['PicPay', 'Starian'].sort());
  assert.ok(result.hits.every((item) => (item.rawPayload.entityNormalization as { version?: string }).version === 'v15'));

  const relevance = filterDiscoveryHitsByProfileRelevance(profile(), result.hits);
  assert.deepEqual(relevance.hits.map((item) => item.companyName), ['PicPay']);
});

test('general consignado query accepts public/private product evidence but private query stays strict', () => {
  const generalProfile = profile({
    profilePayload: { mode: 'quick-search', userQuery: 'Fintechs de crédito consignado no Brasil' },
  });
  const candidates = normalizeDiscoveryEntityHits([
    hit('Empresa INSS', 'Empresa INSS amplia crédito consignado para beneficiários do INSS.'),
    hit('Empresa CLT', 'Empresa CLT expande consignado privado para trabalhadores CLT.'),
  ]).hits;

  const general = filterDiscoveryHitsByProfileRelevance(generalProfile, candidates);
  assert.deepEqual(general.hits.map((item) => item.companyName).sort(), ['Empresa CLT', 'Empresa INSS'].sort());

  const strictPrivate = filterDiscoveryHitsByProfileRelevance(profile(), candidates);
  assert.deepEqual(strictPrivate.hits.map((item) => item.companyName), ['Empresa CLT']);
});
