import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveredCandidateToRow, selectInsertableCandidates } from './searchProfileCaptureRuntime.js';
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

test('selectInsertableCandidates skips already-captured dedupe_keys (409 re-run guard)', () => {
  // O runner redescobre as mesmas investidas a cada execução; só as novas
  // devem ir para o insert, senão o índice único parcial derruba o lote (409).
  const prepared = [
    { dedupeKey: 'name:creditas' },
    { dedupeKey: 'name:drconsulta' },
    { dedupeKey: 'name:novata' },
  ];
  const existing = new Set(['name:creditas', 'name:drconsulta']);

  const result = selectInsertableCandidates(prepared, existing);
  assert.deepEqual(result.map((row) => row.dedupeKey), ['name:novata']);
});

test('selectInsertableCandidates drops intra-batch duplicates and keeps null keys', () => {
  // Mesma empresa em dois fundos gera dedupe_key repetida no mesmo lote; e
  // candidatos sem dedupe_key (chave nula) nunca colidem no índice parcial.
  const prepared = [
    { dedupeKey: 'name:karta' },
    { dedupeKey: 'name:karta' },
    { dedupeKey: null },
    { dedupeKey: undefined },
    { dedupeKey: '' },
  ];

  const result = selectInsertableCandidates(prepared, new Set<string>());
  assert.equal(result.length, 4, 'one karta + three null/empty-key rows');
  assert.equal(result.filter((row) => row.dedupeKey === 'name:karta').length, 1);
});

test('selectInsertableCandidates returns empty when everything is already present', () => {
  const prepared = [{ dedupeKey: 'name:creditas' }, { dedupeKey: 'name:comp' }];
  const existing = new Set(['name:creditas', 'name:comp']);
  assert.deepEqual(selectInsertableCandidates(prepared, existing), []);
});
