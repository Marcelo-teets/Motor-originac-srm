import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateWebsiteIdentityService,
  extractCandidateDomains,
  isWebsiteIdentityRetryDue,
  scoreWebsiteIdentity,
  significantNameTokens,
  websiteIdentityRetryAt,
} from './candidateWebsiteIdentityService.js';

test('extractCandidateDomains uses official email hints and rejects free mailbox domains', () => {
  const domains = extractCandidateDomains({
    rawPayload: {
      email: 'ri@empresa.com.br; financeiro@gmail.com',
      email_resp: 'diretoria@empresa.com.br outro@hotmail.com',
    },
  });
  assert.deepEqual(domains, ['empresa.com.br']);
});

test('significantNameTokens removes legal suffix noise', () => {
  assert.deepEqual(
    significantNameTokens('Empresa Teste Participações S.A.'),
    ['empresa', 'teste'],
  );
});

test('scoreWebsiteIdentity accepts exact CNPJ evidence', () => {
  const score = scoreWebsiteIdentity({
    cnpj: '16670085000155',
    companyName: 'Empresa Teste',
    legalName: 'EMPRESA TESTE S.A.',
  }, 'grupo.com.br', '<html><body>Empresa Teste - CNPJ 16.670.085/0001-55</body></html>');

  assert.equal(score.verified, true);
  assert.equal(score.matchType, 'cnpj');
  assert.equal(score.confidence, 0.99);
});

test('scoreWebsiteIdentity rejects parent-group email domain without company evidence', () => {
  const score = scoreWebsiteIdentity({
    cnpj: '60537263000166',
    companyName: 'ALLPARK EMPREENDIMENTOS, PARTICIPAÇÕES E SERVIÇOS S.A.',
    legalName: 'ALLPARK EMPREENDIMENTOS, PARTICIPAÇÕES E SERVIÇOS S.A.',
  }, 'estapar.com.br', '<html><title>Estapar</title><body>Mobilidade urbana e estacionamentos.</body></html>');

  assert.equal(score.verified, false);
  assert.equal(score.matchType, 'insufficient');
});

test('retry backoff defers unresolved candidates until nextRetryAt', () => {
  const now = new Date('2026-08-12T03:00:00.000Z');
  const nextRetryAt = websiteIdentityRetryAt(1, 'site_unreachable', now);
  assert.equal(nextRetryAt, '2026-08-13T03:00:00.000Z');
  assert.equal(isWebsiteIdentityRetryDue({
    website_identity_capture: { status: 'unresolved', nextRetryAt },
  }, now), false);
  assert.equal(isWebsiteIdentityRetryDue({
    website_identity_capture: { status: 'unresolved', nextRetryAt },
  }, new Date('2026-08-13T03:00:01.000Z')), true);
});

test('service verifies website, prepares review prefill and keeps human promotion gate untouched', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
  const client = {
    select: async (table: string) => {
      if (table === 'candidate_decision_queue_v4') return [{
        id: 'candidate-1',
        company_name: 'Empresa Teste',
        legal_name: 'EMPRESA TESTE S.A.',
        cnpj: '16670085000155',
        website: null,
        normalized_domain: null,
        candidate_status: 'captured',
        priority_tier: 'P1',
        confidence: 0.95,
        evidence_summary: 'Sinal regulatório de teste suficientemente descritivo para a fila de candidatos.',
        raw_payload: {
          identity_review_status: 'pending',
          legal_name_verified: false,
          promotion_ready: false,
        },
      }];
      if (table === 'candidate_official_enrichments') return [{
        candidate_id: 'candidate-1',
        source_url: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
        observed_at: '2026-08-11T15:00:00.000Z',
        data: {
          companyName: 'EMPRESA TESTE S.A.',
          registrationSituation: 'ATIVO',
          tradeName: 'Empresa Teste',
          rawPayload: {
            email: 'ri@empresa.com.br',
            denom_social: 'EMPRESA TESTE S.A.',
          },
        },
      }];
      if (table === 'source_catalog') return [{
        id: 'source-company-website',
        metadata: { code: 'src_company_website' },
      }];
      return [];
    },
    update: async (table: string, payload: Record<string, unknown>, filters: unknown[]) => {
      updates.push({ table, payload, filters });
      return [];
    },
  };

  const service = new CandidateWebsiteIdentityService({
    client: client as never,
    fetchImpl: async () => new Response(
      '<html><title>Empresa Teste</title><body>CNPJ 16.670.085/0001-55</body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ),
    now: () => new Date('2026-08-11T18:00:00.000Z'),
  });

  const result = await service.run({ limit: 10 });

  assert.equal(result.status, 'completed');
  assert.equal(result.targetCount, 1);
  assert.equal(result.websitesVerified, 1);
  assert.equal(result.candidatesUpdated, 1);
  assert.equal(result.reviewPrefillsPrepared, 1);
  assert.equal(result.retryStatesUpdated, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, 'discovered_company_candidates');
  assert.equal(updates[0].payload.website, 'https://empresa.com.br');
  assert.equal(updates[0].payload.normalized_domain, 'empresa.com.br');
  assert.equal('candidate_status' in updates[0].payload, false);
  assert.equal('company_id' in updates[0].payload, false);
  const rawPayload = updates[0].payload.raw_payload as Record<string, unknown>;
  assert.equal(rawPayload.identity_review_status, 'pending');
  assert.equal(rawPayload.legal_name_verified, false);
  assert.equal(rawPayload.identity_evidence_url, 'https://empresa.com.br');
  assert.equal(rawPayload.review_legal_name, 'EMPRESA TESTE S.A.');
  assert.equal(rawPayload.review_cnpj, '16670085000155');
  assert.equal(rawPayload.review_website, 'https://empresa.com.br');
  assert.equal(typeof rawPayload.review_evidence_summary, 'string');
  assert.ok(String(rawPayload.review_evidence_summary).length >= 80);
  assert.equal(rawPayload.review_confidence, 0.99);
  const capture = rawPayload.website_identity_capture as Record<string, unknown>;
  assert.equal(capture.humanApprovalRequired, true);
  assert.equal(capture.matchType, 'cnpj');
  assert.equal(capture.status, 'verified');
  assert.equal(capture.attemptCount, 1);
  assert.equal(capture.nextRetryAt, null);
});

test('service records bounded retry state when candidate website is unreachable', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
  const client = {
    select: async (table: string) => {
      if (table === 'candidate_decision_queue_v4') return [{
        id: 'candidate-2',
        company_name: 'Empresa Offline',
        legal_name: 'EMPRESA OFFLINE S.A.',
        cnpj: '16670085000155',
        website: null,
        normalized_domain: null,
        candidate_status: 'captured',
        priority_tier: 'P1',
        raw_payload: { identity_review_status: 'pending' },
      }];
      if (table === 'candidate_official_enrichments') return [{
        candidate_id: 'candidate-2',
        source_url: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
        data: { rawPayload: { email: 'ri@offline.com.br' } },
      }];
      if (table === 'source_catalog') return [{ id: 'source-company-website', metadata: { code: 'src_company_website' } }];
      return [];
    },
    update: async (table: string, payload: Record<string, unknown>, filters: unknown[]) => {
      updates.push({ table, payload, filters });
      return [];
    },
  };

  const service = new CandidateWebsiteIdentityService({
    client: client as never,
    fetchImpl: async () => { throw new Error('network unavailable'); },
    now: () => new Date('2026-08-12T03:00:00.000Z'),
  });

  const result = await service.run({ limit: 10 });
  assert.equal(result.websitesVerified, 0);
  assert.equal(result.retryStatesUpdated, 1);
  assert.equal(result.unresolved, 1);
  assert.equal(result.errors, 0);
  assert.equal(updates.length, 1);
  const rawPayload = updates[0].payload.raw_payload as Record<string, unknown>;
  const capture = rawPayload.website_identity_capture as Record<string, unknown>;
  assert.equal(capture.status, 'unresolved');
  assert.equal(capture.lastReason, 'site_unreachable');
  assert.equal(capture.attemptCount, 1);
  assert.equal(capture.nextRetryAt, '2026-08-13T03:00:00.000Z');
});

test('service skips a deferred unresolved candidate and advances to the next fresh target', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
  const client = {
    select: async (table: string) => {
      if (table === 'candidate_decision_queue_v4') return [
        {
          id: 'deferred', company_name: 'Deferred', legal_name: 'DEFERRED S.A.', cnpj: '16670085000155',
          website: null, normalized_domain: null, candidate_status: 'captured', priority_tier: 'P1',
          raw_payload: { website_identity_capture: { status: 'unresolved', nextRetryAt: '2026-08-20T00:00:00.000Z' } },
        },
        {
          id: 'fresh', company_name: 'Fresh', legal_name: 'FRESH S.A.', cnpj: '16670085000155',
          website: null, normalized_domain: null, candidate_status: 'captured', priority_tier: 'P1', raw_payload: {},
        },
      ];
      if (table === 'candidate_official_enrichments') return [{
        candidate_id: 'fresh', source_url: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
        data: { companyName: 'FRESH S.A.', registrationSituation: 'ATIVO', rawPayload: { email: 'ri@fresh.com.br' } },
      }];
      if (table === 'source_catalog') return [{ id: 'source-company-website', metadata: { code: 'src_company_website' } }];
      return [];
    },
    update: async (table: string, payload: Record<string, unknown>, filters: unknown[]) => {
      updates.push({ table, payload, filters });
      return [];
    },
  };

  const service = new CandidateWebsiteIdentityService({
    client: client as never,
    fetchImpl: async () => new Response('<html><body>FRESH S.A. CNPJ 16.670.085/0001-55</body></html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    }),
    now: () => new Date('2026-08-12T03:00:00.000Z'),
  });

  const result = await service.run({ limit: 1 });
  assert.equal(result.deferredByBackoff, 1);
  assert.equal(result.targetCount, 1);
  assert.equal(result.websitesVerified, 1);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].filters, [{ column: 'id', value: 'fresh' }]);
});
