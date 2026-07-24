import assert from 'node:assert/strict';
import test from 'node:test';
import {
  streamCvmOpenCompanyRegistry,
  type CvmOpenCompanyRegistryRecord,
  type CvmOpenCompanyRegistryResource,
} from './cvmOpenCompanyRegistryConnector.js';

test('streams only exact target CNPJs from the official registry contract', async () => {
  const csv = [
    'CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;DT_REG;DT_CANCEL;SIT;SIT_EMISSOR;CATEG_REG;SETOR_ATIV;TP_MERC',
    '16.670.085/0001-55;LOCALIZA RENT A CAR S.A.;LOCALIZA;10670;23/05/2005;;ATIVO;FASE OPERACIONAL;Categoria A;Comércio;BOLSA',
    '00.000.000/0001-91;EMPRESA FORA DO ALVO S.A.;;99999;01/01/2000;;ATIVO;FASE OPERACIONAL;Categoria A;Outros;BOLSA',
  ].join('\n');
  const resource: CvmOpenCompanyRegistryResource = {
    key: 'test',
    name: 'CVM test',
    url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
    datasetUrl: 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
    modifiedAt: null,
    etag: null,
  };
  const records: CvmOpenCompanyRegistryRecord[] = [];
  const stats = await streamCvmOpenCompanyRegistry({
    resource,
    targetCnpjs: new Set(['16670085000155']),
    onRecord: async (record) => { records.push(record); },
  });

  assert.equal(stats.rowsScanned, 2);
  assert.equal(stats.recordsMatched, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].cnpj, '16670085000155');
  assert.equal(records[0].companyName, 'LOCALIZA RENT A CAR S.A.');
  assert.equal(records[0].cvmCode, '10670');
  assert.equal(records[0].registrationSituation, 'ATIVO');
  assert.equal(records[0].registrationCategory, 'Categoria A');
  assert.equal(records[0].effectiveDate, '2005-05-23');
});
