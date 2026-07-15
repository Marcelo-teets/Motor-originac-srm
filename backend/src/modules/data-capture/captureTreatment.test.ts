import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanySeed, MonitoringOutput } from '../../types/platform.js';
import { treatCaptureOutputs } from './captureTreatment.js';

const company = { id: 'company-1', tradeName: 'Empresa Teste' } as CompanySeed;
const collectedAt = '2026-07-14T12:00:00.000Z';

const output = (overrides: Partial<MonitoringOutput> = {}): MonitoringOutput => ({
  id: 'output-1',
  companyId: company.id,
  sourceId: 'source-rss',
  title: 'Feed de mercado',
  summary: '',
  collectedAt,
  confidenceScore: 0.95,
  connectorStatus: 'real',
  normalizedPayload: {},
  ...overrides,
});

test('query URL keywords do not generate treatment evidence', () => {
  const result = treatCaptureOutputs(company, [output({
    normalizedPayload: {
      items: [],
      sourceUrl: 'https://news.google.com/rss/search?q=FIDC+recebiveis+funding',
    },
  })], collectedAt);

  assert.equal(result.signals.length, 0);
  assert.equal(result.enrichments.length, 0);
  assert.equal(result.diagnostics.highRelevanceOutputs, 0);
});

test('explicit business text can generate explainable treatment signals', () => {
  const result = treatCaptureOutputs(company, [output({
    summary: 'Empresa anunciou cessão de recebíveis para um novo FIDC.',
    normalizedPayload: {
      items: [{
        title: 'Novo FIDC financiará carteira',
        description: 'A cessão de recebíveis suportará o crescimento.',
      }],
    },
  })], collectedAt);

  assert.ok(result.signals.length > 0);
  assert.ok(result.diagnostics.suggestedStructures.includes('FIDC'));
});
