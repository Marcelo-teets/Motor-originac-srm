import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBcbRegulatedInstitutions } from './bcbRegulatedInstitutionsConnector.js';

const entityRow = {
  database: '2026-08-11',
  codigoCNPJ14: '39587424000150',
  codigoCNPJ8: '39587424',
  nomeEntidadeInteresse: 'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.',
  nomeReduzido: 'UY3 SCD',
  nomeFantasia: 'UY3',
  descricaoTipoSituacaoPessoaJuridica: 'Autorizada em Atividade',
  descricaoTipoEntidadeSupervisionada: 'Sociedade de Crédito Direto',
  descricaoNaturezaJuridica: 'Sociedade Anônima',
  nomeDoMunicipio: 'São Paulo',
  nomeDaUnidadeFederativa: 'São Paulo',
  codigoDoMunicipioNoIBGE: '3550308',
};

const seatRow = {
  CNPJ: '39587424',
  NOME_INSTITUICAO: 'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.',
  SEGMENTO: 'Sociedade de Crédito Direto',
  ENDERECO: 'Rua Teste, 1',
  COMPLEMENTO: '',
  BAIRRO: 'Centro',
  CEP: '01000000',
  MUNICIPIO: 'São Paulo',
  UF: 'SP',
  DDD: '11',
  TELEFONE: '30000000',
  E_MAIL: 'contato@uy3.com.br',
  SITIO_NA_INTERNET: 'www.uy3.com.br',
  MUNICIPIO_IBGE: '3550308',
};

test('merges BCBase full CNPJ with SedesSociedades website fields', async () => {
  const result = await fetchBcbRegulatedInstitutions({
    now: () => new Date('2026-08-12T12:00:00.000Z'),
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('/BcBase/')) return new Response(JSON.stringify({ value: [entityRow] }), { status: 200 });
      return new Response(JSON.stringify({ value: [seatRow] }), { status: 200 });
    },
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.referenceDate, '2026-08-11');
  assert.equal(result.rows[0].cnpj, '39587424000150');
  assert.equal(result.rows[0].cnpjRoot, '39587424');
  assert.equal(result.rows[0].legalName, 'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.');
  assert.equal(result.rows[0].legalStatus, 'Autorizada em Atividade');
  assert.equal(result.rows[0].supervisedType, 'Sociedade de Crédito Direto');
  assert.equal(result.rows[0].website, 'https://www.uy3.com.br/');
  assert.equal(result.pages, 2);
});

test('falls back to a recent BCBase reference date when today has no snapshot', async () => {
  const requested: string[] = [];
  const result = await fetchBcbRegulatedInstitutions({
    now: () => new Date('2026-08-12T12:00:00.000Z'),
    fetchImpl: async (input) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('/SedesSociedades')) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      requested.push(url);
      if (url.includes("'08-12-2026'")) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      return new Response(JSON.stringify({ value: [entityRow] }), { status: 200 });
    },
  });
  assert.equal(result.rows.length, 1);
  assert.ok(requested.some((url) => url.includes("'08-11-2026'")));
});

test('retries transient BCBase failures before succeeding', async () => {
  let entityCalls = 0;
  const sleeps: number[] = [];
  const result = await fetchBcbRegulatedInstitutions({
    attempts: 3,
    now: () => new Date('2026-08-12T12:00:00.000Z'),
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('/SedesSociedades')) return new Response(JSON.stringify({ value: [] }), { status: 200 });
      entityCalls += 1;
      if (entityCalls === 1) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ value: [entityRow] }), { status: 200 });
    },
    sleepImpl: async (ms) => { sleeps.push(ms); },
  });
  assert.equal(result.rows.length, 1);
  assert.equal(entityCalls, 2);
  assert.deepEqual(sleeps, [500]);
});
