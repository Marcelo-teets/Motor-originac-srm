import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePublicRecords } from './publicRecordsCapture.js';
import { searchPncpContracts } from './pncpContracts.js';
import { searchQueridoDiario } from './queridoDiario.js';
import { companySeeds } from '../data/platformSeeds.js';
import type { SourceCatalogEntry } from '../types/platform.js';

const company = companySeeds[0]!;

const pncpSource: SourceCatalogEntry = {
  id: '4f1e7b92-cd65-4eaf-b170-5e6f70819203',
  name: 'PNCP Contratos Públicos (API oficial)',
  sourceType: 'api',
  category: 'public_procurement_receivables',
  status: 'real',
  health: 'healthy',
  metadata: { code: 'src_pncp_contracts_api' },
};

const gazetteSource: SourceCatalogEntry = {
  id: '5a2f8ca3-de76-4fb0-a281-6f7081920314',
  name: 'Querido Diário (diários oficiais municipais)',
  sourceType: 'api',
  category: 'Regulatório',
  status: 'real',
  health: 'healthy',
  metadata: { code: 'src_querido_diario_api' },
};

const pncpPayload = JSON.stringify({
  total: 2,
  items: [
    { id: '00000000000100-1-000001/2026', title: 'Contrato de fornecimento de software', description: 'Prestação de serviços de tecnologia.', orgao_nome: 'Município Exemplo', data_publicacao_pncp: '2026-07-01' },
    { title: 'Ata de registro de preços', description: 'Serviços de antecipação.', orgao: 'Estado Exemplo' },
  ],
});

const gazettePayload = JSON.stringify({
  total_gazettes: 1,
  gazettes: [
    { date: '2026-07-10', territory_name: 'São Paulo', excerpts: ['  Homologação de contrato com a empresa   Exemplo S.A. '], url: 'https://queridodiario.ok.org.br/g/1' },
  ],
});

const withRoutedFetch = async (run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('pncp.gov.br')) return new Response(pncpPayload, { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.includes('queridodiario')) return new Response(gazettePayload, { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error(`unexpected url ${url}`);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('searchPncpContracts parses defensively and builds evidence urls', async () => {
  await withRoutedFetch(async () => {
    const result = await searchPncpContracts('12345678000190');
    assert.equal(result.total, 2);
    assert.equal(result.hits.length, 2);
    assert.match(result.hits[0]!.url, /^https:\/\/pncp\.gov\.br\/app\/contratos/);
    assert.equal(result.hits[0]!.orgao, 'Município Exemplo');
  });
});

test('searchQueridoDiario normalizes excerpts', async () => {
  await withRoutedFetch(async () => {
    const result = await searchQueridoDiario('Exemplo S.A.');
    assert.equal(result.total, 1);
    assert.equal(result.hits[0]!.territoryName, 'São Paulo');
    assert.equal(result.hits[0]!.excerpts[0], 'Homologação de contrato com a empresa Exemplo S.A.');
  });
});

test('capturePublicRecords emits outputs for both sources and signals only on hits', async () => {
  await withRoutedFetch(async () => {
    const bundle = await capturePublicRecords(company, [pncpSource, gazetteSource], new Date().toISOString());

    assert.equal(bundle.outputs.length, 2);
    const bySource = new Map(bundle.outputs.map((output) => [output.normalizedPayload.sourceCode, output]));
    assert.ok(bySource.has('src_pncp_contracts_api'));
    assert.ok(bySource.has('src_querido_diario_api'));
    for (const output of bundle.outputs) {
      assert.equal(output.connectorStatus, 'real');
      assert.ok([pncpSource.id, gazetteSource.id].includes(output.sourceId));
    }

    const signalTypes = bundle.signals.map((signal) => signal.signalType).sort();
    assert.deepEqual(signalTypes, ['public_contract_receivables', 'regulatory_event']);
    assert.equal(bundle.enrichments.length, 2);
  });
});

test('capturePublicRecords: empty search result yields output but no signal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ total: 0, items: [], total_gazettes: 0, gazettes: [] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  try {
    const bundle = await capturePublicRecords(company, [pncpSource, gazetteSource], new Date().toISOString());
    assert.equal(bundle.outputs.length, 2);
    assert.equal(bundle.signals.length, 0, 'empty query must never become a commercial signal');
    assert.equal(bundle.enrichments.length, 0);
    for (const output of bundle.outputs) assert.equal(output.connectorStatus, 'real');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('capturePublicRecords degrades to partial without signals when fetches fail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  try {
    const bundle = await capturePublicRecords(company, [pncpSource, gazetteSource], new Date().toISOString());
    assert.equal(bundle.outputs.length, 2);
    assert.equal(bundle.signals.length, 0, 'errors must never become signals');
    for (const output of bundle.outputs) assert.equal(output.connectorStatus, 'partial');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('capturePublicRecords returns empty bundle without registered or planned sources', async () => {
  const empty = await capturePublicRecords(company, [], new Date().toISOString());
  assert.deepEqual(empty, { outputs: [], signals: [], enrichments: [] });

  const planned = await capturePublicRecords(
    company,
    [{ ...pncpSource, status: 'planned' }, { ...gazetteSource, status: 'planned' }],
    new Date().toISOString(),
  );
  assert.deepEqual(planned, { outputs: [], signals: [], enrichments: [] });
});
