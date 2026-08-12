import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateBcbIdentityService,
  scoreBcbIdentityMatch,
  selectUniqueBcbIdentityMatch,
} from './candidateBcbIdentityService.js';
import type { BcbRegulatedInstitution } from '../modules/public-data/bcbRegulatedInstitutionsConnector.js';

const institution = (
  legalName: string,
  cnpj: string,
  website: string | null = null,
  legalStatus = 'Autorizada em Atividade',
): BcbRegulatedInstitution => ({
  cnpj,
  cnpjRoot: cnpj.slice(0, 8),
  legalName,
  shortName: legalName.split(' ')[0] ?? null,
  fantasyName: legalName.split(' ')[0] ?? null,
  supervisedType: 'Sociedade de Crédito Direto',
  legalStatus,
  legalNature: 'Sociedade Anônima',
  segment: 'Sociedade de Crédito Direto',
  address: null,
  complement: null,
  neighborhood: null,
  zipCode: null,
  city: 'São Paulo',
  state: 'SP',
  areaCode: null,
  phone: null,
  email: null,
  website,
  municipalityIbge: null,
});

test('scores distinctive short brand UY3 against official BCB legal name', () => {
  const score = scoreBcbIdentityMatch('Fintech UY3', institution(
    'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.', '39587424000150', 'https://www.uy3.com.br/',
  ));
  assert.ok(score.score >= 0.95);
  assert.deepEqual(score.candidateTokens, ['uy3']);
  assert.deepEqual(score.matchedTokens, ['uy3']);
});

test('unique match rejects close ambiguity', () => {
  const rows = [
    institution('ABC SOCIEDADE DE CRÉDITO DIRETO S.A.', '11111111000111'),
    institution('ABC INSTITUIÇÃO DE PAGAMENTO S.A.', '22222222000122'),
  ];
  assert.equal(selectUniqueBcbIdentityMatch('ABC', rows), null);
});

test('unique match ignores institutions that are not authorized in activity', () => {
  const rows = [
    institution('UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.', '39587424000150', null, 'Cancelada/Encerrada'),
  ];
  assert.equal(selectUniqueBcbIdentityMatch('UY3', rows), null);
});

test('service writes full BCB CNPJ and official enrichment while preserving human gates', async () => {
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: unknown[] }> = [];
  const upserts: Array<{ table: string; rows: unknown[]; onConflict?: string }> = [];
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
    upsert: async (table: string, rows: unknown[], onConflict?: string) => {
      upserts.push({ table, rows, onConflict });
      return rows;
    },
  };

  const service = new CandidateBcbIdentityService({
    client: client as never,
    fetchInstitutions: async () => ({
      sourceUrl: 'https://bcb.example/BcBase', referenceDate: '2026-08-11', pages: 2,
      rows: [institution('UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.', '39587424000150', 'www.uy3.com.br')],
    }),
    now: () => new Date('2026-08-12T04:30:00.000Z'),
  });
  const result = await service.run();

  assert.equal(result.matched, 1);
  assert.equal(result.fullCnpjsAdded, 1);
  assert.equal(result.officialEnrichmentsWritten, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, 'discovered_company_candidates');
  assert.equal(updates[0].payload.cnpj, '39587424000150');
  assert.equal(updates[0].payload.legal_name, 'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.');
  assert.equal(updates[0].payload.website, 'https://www.uy3.com.br/');
  const raw = updates[0].payload.raw_payload as Record<string, unknown>;
  const bcb = raw.bcb_regulated_identity as Record<string, unknown>;
  assert.equal(bcb.cnpj, '39587424000150');
  assert.equal(bcb.cnpjRoot, '39587424');
  assert.equal(bcb.humanApprovalRequired, true);
  assert.equal(raw.review_cnpj, '39587424000150');
  assert.equal(raw.promotion_ready, false);
  assert.equal('decision_eligible' in raw, false);

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].table, 'candidate_official_enrichments');
  assert.equal(upserts[0].onConflict, 'candidate_id,dataset_code,source_record_key');
  const enrichment = upserts[0].rows[0] as Record<string, unknown>;
  assert.equal(enrichment.entity_cnpj, '39587424000150');
  assert.equal(enrichment.dataset_code, 'bcb_bcbase_entities_candidates');
  assert.equal(enrichment.effective_date, '2026-08-11');
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
    upsert: async () => [],
  };
  const service = new CandidateBcbIdentityService({
    client: client as never,
    fetchInstitutions: async () => {
      fetched = true;
      return { sourceUrl: '', referenceDate: '2026-08-11', rows: [], pages: 0 };
    },
  });
  const result = await service.run();
  assert.equal(result.status, 'no_targets');
  assert.equal(result.ambiguousSkipped, 1);
  assert.equal(fetched, false);
});
