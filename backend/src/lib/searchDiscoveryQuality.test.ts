import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiscoveryEntityHits } from './discoveryEntityNormalization.js';
import { findBestCompanyMatch } from './companyDiscoveryMatching.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';

const hit = (companyName: string, overrides: Partial<DiscoverySourceHit> = {}): DiscoverySourceHit => ({
  companyName,
  sourceRef: 'google-news-rss',
  evidenceSummary: `${companyName} — evidência`,
  confidence: 0.62,
  rawPayload: {},
  ...overrides,
});

test('normalizes malformed headline subjects into reviewable company identities', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Asaas faz 2º FIDC e'),
    hit('CloudWalk, dona da InfinitePay'),
    hit('FIDCs no agronegócio: Basf'),
    hit('Mercado de Recebíveis conclui'),
    hit('Fintech de energia solar, Solfácil'),
    hit('Provu, ex-Lendico'),
  ]);

  assert.deepEqual(
    result.hits.map((item) => item.companyName).sort(),
    ['Asaas', 'Basf', 'CloudWalk', 'Mercado de Recebíveis', 'Provu', 'Solfácil'].sort(),
  );
  assert.equal(result.rejected, 0);
  assert.ok(result.rewritten >= 6);
});

test('rejects editorial themes that are not companies', () => {
  const result = normalizeDiscoveryEntityHits([
    hit('Open Finance'),
    hit('Tendências'),
    hit('Agência de Comunicação'),
    hit('Mercado'),
  ]);

  assert.equal(result.hits.length, 0);
  assert.equal(result.rejected, 4);
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
