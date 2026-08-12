import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateWebsiteIdentityService,
  extractCandidateDomains,
  scoreWebsiteIdentity,
  significantNameTokens,
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

test('service updates website evidence but keeps human promotion gate untouched', async () => {
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
          tradeName: 'Empresa Teste',
          rawPayload: { email: 'ri@empresa.com.br' },
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
  const capture = rawPayload.website_identity_capture as Record<string, unknown>;
  assert.equal(capture.humanApprovalRequired, true);
  assert.equal(capture.matchType, 'cnpj');
});
