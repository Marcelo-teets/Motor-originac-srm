import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FidcMarketMapInputError,
  buildFidcMarketMapRpcArgs,
  normalizeFidcMarketMapSnapshot,
  parseFidcMarketMapQuery,
} from './fidcMarketMap.js';

test('FIDC Market Map query parser normalizes executive filters', () => {
  const query = parseFidcMarketMapQuery({
    q: ' Seller ',
    manager: 'Gestora XP',
    minNav: '10000000',
    minDelinquencyPct: '5,5',
    maxSubordinationPct: '10',
    silenceStatus: 'defasado',
    sort: 'delinquency_desc',
    page: '2',
    pageSize: '50',
  });

  assert.deepEqual(query, {
    search: 'Seller',
    administrator: null,
    manager: 'Gestora XP',
    minNav: 10_000_000,
    maxNav: null,
    minDelinquencyPct: 5.5,
    maxSubordinationPct: 10,
    silenceStatus: 'DEFASADO',
    sort: 'delinquency_desc',
    page: 2,
    pageSize: 50,
  });

  assert.equal(buildFidcMarketMapRpcArgs(query).p_min_delinquency_pct, 5.5);
});

test('FIDC Market Map query parser rejects invalid ranges and statuses', () => {
  assert.throws(
    () => parseFidcMarketMapQuery({ minNav: '20', maxNav: '10' }),
    (error: unknown) => error instanceof FidcMarketMapInputError,
  );
  assert.throws(
    () => parseFidcMarketMapQuery({ silenceStatus: 'inventado' }),
    (error: unknown) => error instanceof FidcMarketMapInputError,
  );
  assert.throws(
    () => parseFidcMarketMapQuery({ minDelinquencyPct: '101' }),
    (error: unknown) => error instanceof FidcMarketMapInputError,
  );
});

test('FIDC Market Map response contract forbids score impact', () => {
  assert.throws(() => normalizeFidcMarketMapSnapshot({ rows: [], source: { scoreImpact: true } }));

  const snapshot = normalizeFidcMarketMapSnapshot({
    rows: [],
    source: { provider: 'Agentetome', sourceCode: 'src_agentetome_api', scoreImpact: false },
  });
  assert.equal(snapshot.source.scoreImpact, false);
});
