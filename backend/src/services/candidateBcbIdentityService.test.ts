import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateBcbIdentityService,
  scoreBcbIdentityMatch,
  selectUniqueBcbIdentityMatch,
} from './candidateBcbIdentityService.js';
import type { BcbRegulatedInstitution } from '../modules/public-data/bcbRegulatedInstitutionsConnector.js';

const institution = (legalName: string, cnpjRoot: string, website: string | null = null): BcbRegulatedInstitution => ({
  cnpjRoot, legalName, segment: 'Sociedade de Crédito Direto', address: null, complement: null,
  neighborhood: null, zipCode: null, city: 'São Paulo', state: 'SP', areaCode: null,
  phone: null, email: null, website, municipalityIbge: null,
});

test('scores distinctive short brand UY3 against official BCB legal name', () => {
  const score = scoreBcbIdentityMatch('Fintech UY3', institution(
    'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.', '39587424', 'https://www.uy3.com.br/',
  ));
  assert.ok(score.score >= 0.95);
  assert.deepEqual(score.candidateTokens, ['uy3']);
  assert.deepEqual(score.matchedTokens, ['uy3']);
});

test('unique match rejects close ambiguity', () => {
  const rows = [
    institution('ABC SOCIEDADE DE CRÉDITO DIRETO S.A.', '11111111'),
    institution('ABC INSTITUIÇÃO DE PAGAMENTO S.A.', '22222222'),
  ];
  assert.equal(selectUniqueBcbIdentityMatch('ABC', rows), null);
});

test('service writes BCB root and RFB target without inventing full CNPJ', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
  const client = {
    select: async (table: string) => {
      if (table === 'discovered_company_candidates') return [{
        id: 'uy3-candidate', company_name: 'Fintech UY3', legal_name: 'Fintech UY3', cnpj: null,
        website: null, normalized_domain: '', candidate_status: 'captured',
        raw_payload: {
          candidate_role: 'operating_company', commercial_queue: true,
          commercial_semantics: { signalClass: 'direct_funding_trigger' },
          promotion_ready: false,
        },
      }];
      if (table === 'source_catalog') return [{
        id: 'bcb-source', metadata: { code: 'src_banco_central_do_brasil_dados_abertos' },
      }];
      return [];
    },
    update: async (table: string, payload: Record<string, unknown>, filters: unknown[]) => {
      updates.push({ table, payload, filters });
      return [];
    },
  };

  const service = new CandidateBcbIdentityService({
    client: client as never,
    fetchInstitutions: async () => ({
      sourceUrl: 'https://bcb.example/SedesSociedades', pages: 1,
      rows: [institution('UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.', '39587424', 'www.uy3.com.br')],
    }),
    now: () => new Date('2026-08-12T04:30:00.000Z'),
  });
  const result = await service.run();

  assert.equal(result.matched, 1);
  assert.equal(result.rfbRootsPrepared, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, 'discovered_company_candidates');
  assert.equal('cnpj' in updates[0].payload, false);
  assert.equal(updates[0].payload.legal_name, 'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.');
  assert.equal(updates[0].payload.website, 'https://www.uy3.com.br/');
  const raw = updates[0].payload.raw_payload as Record<string, unknown>;
  const bcb = raw.bcb_regulated_identity as Record<string, unknown>;
  const rfb = raw.rfb_candidate_identity_target as Record<string, unknown>;
  assert.equal(bcb.cnpjRoot, '39587424');
  assert.equal(bcb.humanApprovalRequired, true);
  assert.equal(rfb.cnpjRoot, '39587424');
  assert.equal(raw.promotion_ready, false);
  assert.equal('decision_eligible' in raw, false);
});

test('service skips candidates already marked ambiguous by first-party evidence', async () => {
  let fetched = false;
  const client = {
    select: async (table: string) => table === 'discovered_company_candidates' ? [{
      id: 'open-co', company_name: 'Open Co', legal_name: 'Open Co', cnpj: null,
      website: 'https://open-co.com/', normalized_domain: 'open-co.com', candidate_status: 'captured',
      raw_payload: {
        candidate_role: 'operating_company', commercial_queue: true,
        commercial_semantics: { signalClass: 'direct_funding_trigger' },
        first_party_identity_capture: { status: 'ambiguous_group' },
      },
    }] : [],
    update: async () => [],
  };
  const service = new CandidateBcbIdentityService({
    client: client as never,
    fetchInstitutions: async () => { fetched = true; return { sourceUrl: '', rows: [], pages: 0 }; },
  });
  const result = await service.run();
  assert.equal(result.status, 'no_targets');
  assert.equal(result.ambiguousSkipped, 1);
  assert.equal(fetched, false);
});
