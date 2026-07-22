import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveredCandidateToRow } from './searchProfileCaptureRuntime.js';
import type { DiscoveredCandidateRecord } from './searchProfileCaptureService.js';

const base = (overrides: Partial<DiscoveredCandidateRecord>): DiscoveredCandidateRecord => ({
  id: 'cand',
  searchProfileRunId: 'run',
  searchProfileId: 'sp',
  companyName: 'Alpha',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Credit',
  companyType: 'Scale-up',
  creditProduct: 'Antecipação',
  targetStructure: 'FIDC',
  sourceRef: 'vc-portfolio:Kaszek',
  evidenceSummary: 'listada',
  receivables: [],
  confidence: 0.55,
  dedupeKey: 'name:alpha',
  rawPayload: {},
  candidateStatus: 'captured',
  capturedAt: '2026-07-22T00:00:00Z',
  createdAt: '2026-07-22T00:00:00Z',
  updatedAt: '2026-07-22T00:00:00Z',
  ...overrides,
});

test('discoveredCandidateToRow never emits undefined values (PGRST102 guard)', () => {
  // Um candidato de portfólio (sem website/cnpj) e um de notícias (com website)
  // — o mix que quebrava o insert em lote.
  const portfolioRow = discoveredCandidateToRow(base({}));
  const newsRow = discoveredCandidateToRow(base({ website: 'https://x.com', cnpj: '12345678000190', legalName: 'Beta S.A.' }));

  for (const row of [portfolioRow, newsRow]) {
    for (const [key, value] of Object.entries(row)) {
      assert.notEqual(value, undefined, `${key} must not be undefined`);
    }
  }
});

test('discoveredCandidateToRow yields identical key sets across a heterogeneous batch', () => {
  const rows = [
    discoveredCandidateToRow(base({})),
    discoveredCandidateToRow(base({ website: 'https://x.com', companyId: 'cmp_1', promotedAt: '2026-07-22T01:00:00Z' })),
    discoveredCandidateToRow(base({ legalName: 'Gamma Ltda', cnpj: '99999999000191' })),
  ];
  const keySets = rows.map((row) => JSON.stringify(Object.keys(row).sort()));
  assert.equal(new Set(keySets).size, 1, 'all rows in a bulk insert must share the same key set');
  // JSON.stringify preserva as chaves porque os opcionais viram null, não undefined.
  assert.ok(JSON.stringify(rows[0]).includes('"website":null'));
});
