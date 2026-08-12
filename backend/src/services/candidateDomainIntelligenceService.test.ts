import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateDomainIntelligenceService,
  extractObservedDomainHints,
  generateDomainGuesses,
  isDomainResolutionInCooldown,
  isSafePublicDomain,
} from './candidateDomainIntelligenceService.js';

test('safe-domain guard blocks government, social, free-mail, localhost and IP hosts', () => {
  assert.equal(isSafePublicDomain('empresa.com.br'), true);
  assert.equal(isSafePublicDomain('dados.cvm.gov.br'), false);
  assert.equal(isSafePublicDomain('linkedin.com'), false);
  assert.equal(isSafePublicDomain('gmail.com'), false);
  assert.equal(isSafePublicDomain('localhost'), false);
  assert.equal(isSafePublicDomain('127.0.0.1'), false);
});

test('observed hints prefer corporate emails and discard source-platform domains', () => {
  const hints = extractObservedDomainHints({
    raw_payload: { article: 'https://linkedin.com/company/empresa', support: 'https://ajuda.empresa.com.br' },
    source_url: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
    evidence_summary: 'Contato: ri@empresa.com.br',
  }, [{
    candidate_id: 'candidate-1',
    data: { rawPayload: { email: 'ri@empresa.com.br; financeiro@gmail.com' } },
  }]);

  assert.equal(hints[0]?.domain, 'empresa.com.br');
  assert.equal(hints[0]?.strategy, 'official_email');
  assert.equal(hints.some((hint) => hint.domain === 'linkedin.com'), false);
  assert.equal(hints.some((hint) => hint.domain.endsWith('cvm.gov.br')), false);
});

test('domain guesses are bounded and name-derived', () => {
  const guesses = generateDomainGuesses({
    company_name: 'Empresa Teste',
    legal_name: 'EMPRESA TESTE PARTICIPACOES S.A.',
  });
  assert.ok(guesses.length > 0);
  assert.ok(guesses.length <= 6);
  assert.equal(guesses[0]?.domain, 'empresateste.com.br');
  assert.equal(guesses[0]?.strategy, 'name_guess');
});

test('domain trace honors its next retry timestamp', () => {
  const candidate = {
    id: 'candidate-1',
    company_name: 'Empresa Teste',
    legal_name: 'EMPRESA TESTE S.A.',
    cnpj: '16670085000155',
    website: null,
    normalized_domain: null,
    candidate_status: 'captured',
    priority_tier: 'P1',
    raw_payload: {
      domain_intelligence: {
        status: 'unresolved',
        lastAttemptAt: '2026-08-11T12:00:00.000Z',
        nextRetryAt: '2026-08-18T12:00:00.000Z',
      },
    },
  };
  assert.equal(isDomainResolutionInCooldown(candidate, new Date('2026-08-12T12:00:00.000Z')), true);
  assert.equal(isDomainResolutionInCooldown(candidate, new Date('2026-08-20T12:00:00.000Z')), false);
});

test('service verifies a first-party domain from deterministic name guesses and preserves human identity gate', async () => {
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
        priority_tier: 'P2',
        source_url: 'https://news.google.com/rss/articles/abc',
        evidence_summary: 'Empresa Teste capturada pelo motor de descoberta.',
        raw_payload: {
          identity_review_status: 'pending',
          legal_name_verified: false,
          promotion_ready: false,
        },
      }];
      if (table === 'candidate_official_enrichments') return [];
      return [];
    },
    update: async (table: string, payload: Record<string, unknown>, filters: unknown[]) => {
      updates.push({ table, payload, filters });
      return [];
    },
  };

  const service = new CandidateDomainIntelligenceService({
    client: client as never,
    fetchImpl: async (url) => {
      if (!String(url).includes('empresateste.com.br')) return new Response('not found', { status: 404 });
      return new Response(
        '<html><title>Empresa Teste</title><body>Empresa Teste - CNPJ 16.670.085/0001-55</body></html>',
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    },
    now: () => new Date('2026-08-12T12:00:00.000Z'),
  });

  const result = await service.run({ limit: 10 });

  assert.equal(result.status, 'completed');
  assert.equal(result.websitesVerified, 1);
  assert.equal(result.candidatesUpdated, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.table, 'discovered_company_candidates');
  assert.equal(updates[0]?.payload.website, 'https://empresateste.com.br');
  assert.equal(updates[0]?.payload.normalized_domain, 'empresateste.com.br');
  assert.equal('candidate_status' in updates[0]!.payload, false);
  assert.equal('company_id' in updates[0]!.payload, false);

  const rawPayload = updates[0]?.payload.raw_payload as Record<string, unknown>;
  assert.equal(rawPayload.identity_review_status, 'pending');
  assert.equal(rawPayload.legal_name_verified, false);
  const intelligence = rawPayload.domain_intelligence as Record<string, unknown>;
  assert.equal(intelligence.status, 'verified');
  assert.equal(intelligence.resolutionStrategy, 'name_guess');
  assert.equal(intelligence.humanApprovalRequired, true);
});

test('service shares website retry backoff and skips repeated unresolved probes', async () => {
  const candidate = {
    id: 'candidate-2',
    company_name: 'Companhia Sem Site',
    legal_name: 'COMPANHIA SEM SITE S.A.',
    cnpj: '16670085000155',
    website: null,
    normalized_domain: null,
    candidate_status: 'captured',
    priority_tier: 'P3',
    source_url: null,
    evidence_summary: null,
    raw_payload: {},
  };
  let persistedRawPayload: Record<string, unknown> = {};
  let fetchCalls = 0;
  const client = {
    select: async (table: string) => {
      if (table === 'candidate_decision_queue_v4') return [{ ...candidate, raw_payload: persistedRawPayload }];
      if (table === 'candidate_official_enrichments') return [];
      return [];
    },
    update: async (_table: string, payload: Record<string, unknown>) => {
      persistedRawPayload = payload.raw_payload as Record<string, unknown>;
      return [];
    },
  };
  const now = new Date('2026-08-12T12:00:00.000Z');
  const service = new CandidateDomainIntelligenceService({
    client: client as never,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('not found', { status: 404 });
    },
    now: () => now,
  });

  const first = await service.run({ limit: 10 });
  assert.equal(first.unresolved, 1);
  assert.ok(fetchCalls > 0);
  const callsAfterFirst = fetchCalls;

  const second = await service.run({ limit: 10 });
  assert.equal(second.status, 'no_targets');
  assert.equal(second.skippedCooldown, 1);
  assert.equal(fetchCalls, callsAfterFirst);
});
