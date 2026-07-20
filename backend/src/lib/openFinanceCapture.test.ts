import test from 'node:test';
import assert from 'node:assert/strict';
import { captureOpenFinanceParticipation } from './openFinanceCapture.js';
import { fetchOpenFinanceParticipants } from './openFinanceParticipants.js';
import { companySeeds } from '../data/platformSeeds.js';
import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';

const baseCompany = companySeeds[0]!;

const source: SourceCatalogEntry = {
  id: '7c40aec5-fa98-4bd2-a4a3-819203142536',
  name: 'Open Finance Brasil Participants (diretório oficial)',
  sourceType: 'api',
  category: 'embedded_finance',
  status: 'real',
  health: 'healthy',
  metadata: { code: 'src_open_finance_participants_api' },
};

const directoryPayload = JSON.stringify([
  { OrganisationId: 'org-1', OrganisationName: 'Pagora Pagamentos', RegisteredName: 'Pagora Pagamentos S.A.', RegistrationNumber: '12.345.678/0001-90', Status: 'Active' },
  { OrganisationId: 'org-2', OrganisationName: 'Banco Exemplo', RegisteredName: 'Banco Exemplo S.A.', RegistrationNumber: '98.765.432/0001-10', Status: 'Active' },
  { OrganisationName: '' },
]);

const withStubbedFetch = async (payload: string | null, run: (calls: () => number) => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    count += 1;
    if (payload === null) throw new Error('network down');
    return new Response(payload, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await run(() => count);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('fetchOpenFinanceParticipants parses defensively and normalizes CNPJ digits', async () => {
  await withStubbedFetch(directoryPayload, async () => {
    const participants = await fetchOpenFinanceParticipants();
    assert.equal(participants.length, 2);
    assert.equal(participants[0]!.cnpj, '12345678000190');
    assert.equal(participants[0]!.status, 'Active');
  });
});

test('captureOpenFinanceParticipation matches by exact CNPJ with authoritative confidence', async () => {
  const company: CompanySeed = { ...baseCompany, cnpj: '12.345.678/0001-90' };
  await withStubbedFetch(directoryPayload, async () => {
    const bundle = await captureOpenFinanceParticipation(company, [source], new Date().toISOString());

    assert.equal(bundle.outputs.length, 1);
    assert.equal(bundle.outputs[0]!.sourceId, source.id);
    assert.equal(bundle.outputs[0]!.normalizedPayload.matchMethod, 'cnpj');

    assert.equal(bundle.signals.length, 1);
    assert.equal(bundle.signals[0]!.signalType, 'financial_infrastructure_signal');
    assert.equal(bundle.signals[0]!.signalStrength, 84);
    assert.equal(bundle.signals[0]!.confidenceScore, 0.9);

    assert.equal(bundle.enrichments[0]!.enrichmentType, 'open_finance_participation');
  });
});

test('captureOpenFinanceParticipation matches by exact normalized name only (never substring)', async () => {
  const company: CompanySeed = { ...baseCompany, cnpj: '', tradeName: 'Pagora Pagamentos', legalName: 'Outro Nome Ltda' };
  await withStubbedFetch(directoryPayload, async () => {
    const bundle = await captureOpenFinanceParticipation(company, [source], new Date().toISOString());
    assert.equal(bundle.signals.length, 1);
    assert.equal(bundle.outputs[0]!.normalizedPayload.matchMethod, 'exact_name');
    assert.equal(bundle.signals[0]!.signalStrength, 76);
  });

  const partialName: CompanySeed = { ...baseCompany, cnpj: '', tradeName: 'Pagora', legalName: 'Pagora' };
  await withStubbedFetch(directoryPayload, async () => {
    const bundle = await captureOpenFinanceParticipation(partialName, [source], new Date().toISOString());
    assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] }, 'substring of a participant name must not match');
  });
});

test('captureOpenFinanceParticipation memoizes the directory fetch per run', async () => {
  const company: CompanySeed = { ...baseCompany, cnpj: '12.345.678/0001-90' };
  await withStubbedFetch(directoryPayload, async (calls) => {
    const collectedAt = new Date().toISOString();
    await Promise.all([
      captureOpenFinanceParticipation(company, [source], collectedAt),
      captureOpenFinanceParticipation({ ...company, id: 'other' }, [source], collectedAt),
    ]);
    assert.equal(calls(), 1, 'directory must be fetched once per engine run');
  });
});

test('captureOpenFinanceParticipation stays silent without match, source or directory', async () => {
  const outsider: CompanySeed = { ...baseCompany, cnpj: '11.111.111/0001-11', tradeName: 'Fora do Diretório', legalName: 'Fora do Diretório Ltda' };
  await withStubbedFetch(directoryPayload, async () => {
    const bundle = await captureOpenFinanceParticipation(outsider, [source], new Date().toISOString());
    assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] });
  });

  await withStubbedFetch(null, async () => {
    const bundle = await captureOpenFinanceParticipation(outsider, [source], new Date().toISOString());
    assert.deepEqual(bundle, { outputs: [], signals: [], enrichments: [] }, 'directory failure must never become a signal');
  });

  const noSource = await captureOpenFinanceParticipation(outsider, [], new Date().toISOString());
  assert.deepEqual(noSource, { outputs: [], signals: [], enrichments: [] });

  const planned = await captureOpenFinanceParticipation(outsider, [{ ...source, status: 'planned' }], new Date().toISOString());
  assert.deepEqual(planned, { outputs: [], signals: [], enrichments: [] });
});
