import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformRepository } from '../repositories/platformRepository.js';
import type { SourceCatalogEntry } from '../types/platform.js';
import { buildSourceIdentityLookup, PlatformService } from './platformService.js';

const source = (id: string, code: string): SourceCatalogEntry => ({
  id,
  name: id,
  sourceType: 'rss',
  category: 'News/RSS',
  status: 'real',
  health: 'healthy',
  metadata: { code },
});

test('source lookup does not ambiguously attribute one code to duplicate catalog rows', () => {
  const lookup = buildSourceIdentityLookup([
    source('uuid-a', 'src_google_news_rss'),
    source('uuid-b', 'src_google_news_rss'),
    source('uuid-c', 'src_brasilapi_cnpj'),
  ]);

  assert.equal(lookup.get('uuid-a'), 'uuid-a');
  assert.equal(lookup.get('uuid-b'), 'uuid-b');
  assert.equal(lookup.get('src_google_news_rss'), undefined);
  assert.equal(lookup.get('src_brasilapi_cnpj'), 'uuid-c');
});

test('getMonitoringSnapshot returns signal-driven triggers with source metadata', async () => {
  const service = new PlatformService(createPlatformRepository('memory'));
  const snapshot = await service.getMonitoringSnapshot();
  assert.ok(snapshot.recentTriggers.length > 0);
  assert.ok(snapshot.activeSources.length > 0);
  assert.ok(snapshot.recentTriggers[0].company.length > 0);
  assert.ok(snapshot.recentTriggers[0].source.length > 0);
});

test('getPipelineSnapshot returns recent activities ordered by latest update', async () => {
  const service = new PlatformService(createPlatformRepository('memory'));
  await service.saveActivity({
    companyId: 'cmp_neon_receivables',
    type: 'meeting',
    title: 'Atividade antiga',
    description: 'Registro inicial',
    owner: 'Origination',
    status: 'open',
    dueDate: null,
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await service.saveActivity({
    companyId: 'cmp_neon_receivables',
    type: 'meeting',
    title: 'Atividade mais recente',
    description: 'Registro mais recente',
    owner: 'Origination',
    status: 'open',
    dueDate: null,
  });
  const snapshot = await service.getPipelineSnapshot();
  assert.equal(snapshot.recentActivities[0]?.title, 'Atividade mais recente');
  assert.ok(snapshot.recentActivities[0]?.companyName.length);
});
