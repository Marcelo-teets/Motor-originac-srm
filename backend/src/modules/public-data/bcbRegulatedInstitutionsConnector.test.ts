import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBcbRegulatedInstitutions } from './bcbRegulatedInstitutionsConnector.js';

test('maps BCB SedesSociedades fields and normalizes website', async () => {
  const result = await fetchBcbRegulatedInstitutions({
    fetchImpl: async () => new Response(JSON.stringify({
      value: [{
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
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].cnpjRoot, '39587424');
  assert.equal(result.rows[0].legalName, 'UY3 SOCIEDADE DE CRÉDITO DIRETO S.A.');
  assert.equal(result.rows[0].website, 'https://www.uy3.com.br/');
  assert.equal(result.pages, 1);
});

test('retries transient BCB failures before succeeding', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await fetchBcbRegulatedInstitutions({
    attempts: 3,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    },
    sleepImpl: async (ms) => { sleeps.push(ms); },
  });
  assert.equal(result.rows.length, 0);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [500]);
});
