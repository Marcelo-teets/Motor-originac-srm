import test from 'node:test';
import assert from 'node:assert/strict';
import { rankDiscoveryCatalogSources, type DiscoveryCatalogSource } from './discoverySourceCatalog.js';
import type { SearchProfile } from '../types/platform.js';

const source = (code: string, name: string, domain: string, category: string): DiscoveryCatalogSource => ({
  code,
  name,
  domain,
  category,
});

const sources: DiscoveryCatalogSource[] = [
  source('src_finsiders_rss', 'Finsiders RSS', 'finsiders.com.br', 'Fintech media'),
  source('src_startups_com_br_rss', 'Startups BR RSS', 'startups.com.br', 'Startup media'),
  source('src_brazil_journal_rss', 'Brazil Journal RSS', 'braziljournal.com', 'Business media'),
  source('src_neofeed_rss', 'NeoFeed RSS', 'neofeed.com.br', 'Business media'),
  source('src_pipeline_valor_empresas_rss', 'Valor Empresas RSS', 'valor.globo.com', 'Business media'),
  source('src_bloomberg_linea_rss', 'Bloomberg Linea RSS', 'bloomberglinea.com.br', 'LatAm business media'),
  source('src_exame_negocios_rss', 'Exame News RSS', 'exame.com', 'Business media'),
  source('src_infomoney_business_rss', 'InfoMoney Business RSS', 'infomoney.com.br', 'Business media'),
  source('src_distrito', 'Distrito', 'distrito.me', 'vc_portfolio'),
  source('src_endeavor_brasil', 'Endeavor Brasil', 'endeavor.org.br', 'company_site'),
  source('src_agfeed_rss', 'AgFeed RSS', 'agfeed.com.br', 'Agro business media'),
];

const profile = (input: Partial<SearchProfile> & { query: string }): SearchProfile => ({
  id: 'profile-routing',
  name: 'Routing test',
  segment: 'Fintech',
  subsegment: 'Crédito PME',
  companyType: 'Plataforma',
  geography: 'Brasil',
  creditProduct: 'Crédito PME',
  receivables: ['Duplicatas'],
  targetStructure: 'FIDC',
  minimumSignalIntensity: 60,
  minimumConfidence: 0.7,
  timeWindowDays: 90,
  status: 'active',
  profilePayload: { mode: 'quick-search', userQuery: input.query },
  ...input,
});

test('agro and CRA searches route AgFeed into the first dedicated source lane', () => {
  const ranked = rankDiscoveryCatalogSources(profile({
    query: 'Agtechs e empresas do agro com recebíveis e necessidade de CRA ou FIDC',
    segment: 'Agro',
    subsegment: 'Crédito rural',
    creditProduct: 'Crédito rural',
    targetStructure: 'CRA',
  }), sources);

  assert.equal(ranked[0]?.code, 'src_agfeed_rss');
  assert.ok(ranked.slice(0, 8).some((item) => item.code === 'src_agfeed_rss'));
});

test('fintech searches keep Finsiders ahead and do not force AgFeed into unrelated dedicated lanes', () => {
  const ranked = rankDiscoveryCatalogSources(profile({
    query: 'Fintechs de consignado privado com carteira crescendo e fit para FIDC',
    segment: 'Fintech',
    subsegment: 'Crédito consignado',
    creditProduct: 'Consignado',
    targetStructure: 'FIDC',
  }), sources);

  assert.equal(ranked[0]?.code, 'src_finsiders_rss');
  assert.equal(ranked.slice(0, 8).some((item) => item.code === 'src_agfeed_rss'), false);
});

test('DCM searches prioritize governed general business media rather than an unrelated niche source', () => {
  const ranked = rankDiscoveryCatalogSources(profile({
    query: 'Empresas prontas para emissão de debêntures no mercado de capitais',
    segment: 'Middle Market',
    subsegment: 'Corporate',
    targetStructure: 'Debênture',
  }), sources);

  const firstFour = ranked.slice(0, 4).map((item) => item.code);
  assert.ok(firstFour.some((code) => [
    'src_brazil_journal_rss',
    'src_neofeed_rss',
    'src_pipeline_valor_empresas_rss',
    'src_bloomberg_linea_rss',
    'src_infomoney_business_rss',
    'src_exame_negocios_rss',
  ].includes(code)));
  assert.notEqual(ranked[0]?.code, 'src_agfeed_rss');
});
