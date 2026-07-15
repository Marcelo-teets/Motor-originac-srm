import test from 'node:test';
import assert from 'node:assert/strict';
import type { MonitoringOutput } from '../../types/platform.js';
import { isProbativeMonitoringOutput, outputPublishedAt } from './outputEvidence.js';

const output = (overrides: Partial<MonitoringOutput> = {}): MonitoringOutput => ({
  id: 'output-1',
  companyId: 'company-1',
  sourceId: 'source-1',
  title: 'Captura',
  summary: 'Empresa anunciou uma carteira de recebíveis.',
  collectedAt: '2026-07-14T12:00:00.000Z',
  confidenceScore: 0.8,
  connectorStatus: 'real',
  normalizedPayload: {},
  ...overrides,
});

test('empty RSS payload is not probative even when legacy status says real', () => {
  assert.equal(isProbativeMonitoringOutput(output({
    normalizedPayload: {
      items: [],
      sourceUrl: 'https://news.google.com/rss/search?q=FIDC+recebiveis',
    },
  })), false);
});

test('RSS item business text is probative and carries publication freshness', () => {
  const itemOutput = output({
    normalizedPayload: {
      items: [{ title: 'Empresa capta via FIDC', publishedAt: '2026-07-12T10:00:00.000Z' }],
    },
  });
  assert.equal(isProbativeMonitoringOutput(itemOutput), true);
  assert.equal(outputPublishedAt(itemOutput), '2026-07-12T10:00:00.000Z');
});

test('partial connector output never becomes observed evidence', () => {
  assert.equal(isProbativeMonitoringOutput(output({ connectorStatus: 'partial' })), false);
});
