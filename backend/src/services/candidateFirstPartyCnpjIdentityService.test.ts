import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateFirstPartyCnpjIdentityService,
  extractValidCnpjs,
  scoreRegistryIdentity,
} from './candidateFirstPartyCnpjIdentityService.js';

const baseCandidate = {
  id: 'asaas-candidate',
  company_name: 'Asaas',
  legal_name: 'Asaas',
  cnpj: null,
  website: 'https://asaas.com/',
  normalized_domain: 'asaas.com',
  candidate_status: 'captured',
  candidate_role: 'portfolio_company',
  queue_type: 'identity',
  canonical_rank: 1,
  identity_review_status: 'pending',
  promotion_ready: false,
  raw_payload: {
    domain_intelligence: { status: 'verified', confidence: 0.95 },
  },
};

test('extractValidCnpjs keeps checksum-valid unique CNPJs only', () => {
  const html = `
    <p>CNPJ 19.540.550/0001-21</p>
    <p>Também repetido como 19540550000121</p>
    <p>Inválido 11.111.111/1111-11</p>
  `;
  assert.deepEqual(extractValidCnpjs(html), ['19540550000121']);
});

test('registry identity score accepts exact brand in trade name', () => {
  const score = scoreRegistryIdentity(
    { companyName: 'Asaas', legalName: 'Asaas' },
    {
      razao_social: 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.',
      nome_fantasia: 'ASAAS GESTAO FINANCEIRA',
    },
  );
  assert.equal(score.confidence, 0.99);
  assert.equal(score.legalName, 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.');
  assert.ok(score.matchedTokens.includes('asaas'));
});

test('service resolves one first-party CNPJ, corroborates registry and preserves human gates', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const upserts: Array<{ table: string; rows: unknown[]; onConflict?: string }> = [];
  const client = {
    select: async (table: string) => {
      if (table === 'candidate_decision_queue_v4') return [baseCandidate];
      if (table === 'source_catalog') return [
        { id: 'website-source', metadata: { code: 'src_company_website' } },
        { id: 'brasilapi-source', metadata: { code: 'src_brasilapi_cnpj' } },
      ];
      return [];
    },
    update: async (_table: string, payload: Record<string, unknown>) => {
      updates.push(payload);
      return [];
    },
    upsert: async (table: string, rows: unknown[], onConflict?: string) => {
      upserts.push({ table, rows, onConflict });
      return rows;
    },
  };

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/')) {
      return new Response('<html><a href="/politica-de-privacidade">Privacidade</a></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (url.includes('politica-de-privacidade')) {
      return new Response('<html><body>Asaas Gestão Financeira · CNPJ 19.540.550/0001-21</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
  };

  const service = new CandidateFirstPartyCnpjIdentityService({
    client: client as never,
    fetchImpl,
    fetchRegistry: async (cnpj: string) => ({
      status: 'real' as const,
      endpoint: `https://brasilapi.test/api/cnpj/v1/${cnpj}`,
      data: {
        cnpj,
        razao_social: 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.',
        nome_fantasia: 'ASAAS GESTAO FINANCEIRA',
        descricao_situacao_cadastral: 'ATIVA',
        municipio: 'JOINVILLE',
        uf: 'SC',
      },
    }),
    now: () => new Date('2026-10-09T17:00:00.000Z'),
  });

  const result = await service.run({ limit: 10 });
  assert.equal(result.targets, 1);
  assert.equal(result.uniqueCnpjFound, 1);
  assert.equal(result.matched, 1);
  assert.equal(result.errors, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].cnpj, '19540550000121');
  assert.equal(updates[0].legal_name, 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.');
  const raw = updates[0].raw_payload as Record<string, unknown>;
  const identity = raw.first_party_cnpj_identity as Record<string, unknown>;
  assert.equal(identity.status, 'matched');
  assert.equal(identity.humanApprovalRequired, true);
  assert.equal(identity.automaticPromotion, false);
  assert.equal(identity.automaticDecisionEligibility, false);
  assert.equal(raw.identity_review_status, 'pending');
  assert.equal(raw.promotion_ready, false);
  assert.equal('decision_eligible' in raw, false);

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].table, 'candidate_official_enrichments');
  assert.equal(upserts[0].rows.length, 2);
  assert.equal(upserts[0].onConflict, 'candidate_id,dataset_code,source_record_key');
  const rows = upserts[0].rows as Array<Record<string, unknown>>;
  assert.equal(rows[0].source_id, 'website-source');
  assert.equal(rows[1].source_id, 'brasilapi-source');
});

test('service refuses automatic selection when the official domain exposes multiple valid CNPJs', async () => {
  let registryCalled = false;
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    select: async (table: string) => table === 'candidate_decision_queue_v4'
      ? [baseCandidate]
      : table === 'source_catalog' ? [] : [],
    update: async (_table: string, payload: Record<string, unknown>) => {
      updates.push(payload);
      return [];
    },
    upsert: async () => [],
  };

  const service = new CandidateFirstPartyCnpjIdentityService({
    client: client as never,
    fetchImpl: async () => new Response(
      '<html>CNPJ 19.540.550/0001-21 e CNPJ 32.997.490/0001-39</html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    ),
    fetchRegistry: async () => {
      registryCalled = true;
      return { status: 'partial' as const, endpoint: '', data: { fallback: true, cnpj: '', error: 'not_called' } };
    },
  });

  const result = await service.run();
  assert.equal(result.matched, 0);
  assert.equal(result.ambiguous, 1);
  assert.equal(registryCalled, false);
  const raw = updates.at(-1)?.raw_payload as Record<string, unknown>;
  const identity = raw.first_party_cnpj_identity as Record<string, unknown>;
  assert.equal(identity.status, 'ambiguous');
  assert.equal(identity.humanApprovalRequired, true);
});

test('service only targets verified-domain identity-lane candidates', async () => {
  let fetched = false;
  const client = {
    select: async (table: string) => table === 'candidate_decision_queue_v4'
      ? [{ ...baseCandidate, raw_payload: { domain_intelligence: { status: 'unresolved', confidence: 0 } } }]
      : [],
    update: async () => [],
    upsert: async () => [],
  };
  const service = new CandidateFirstPartyCnpjIdentityService({
    client: client as never,
    fetchImpl: async () => {
      fetched = true;
      return new Response('');
    },
  });
  const result = await service.run();
  assert.equal(result.status, 'no_targets');
  assert.equal(fetched, false);
});
