import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePublicBulkRow,
  parseDelimitedText,
  type PublicBulkResource,
} from './publicBulkDatasetConnector.js';

async function* chunks(...values: string[]) {
  for (const value of values) yield value;
}

const resource = (overrides: Partial<PublicBulkResource> = {}): PublicBulkResource => ({
  key: 'resource-test',
  name: 'resource.csv',
  url: 'https://example.gov.br/resource.csv',
  format: 'csv',
  encoding: 'utf-8',
  delimiter: ';',
  referenceDate: '2026-07-01',
  ...overrides,
});

const targets = {
  targetCnpjs: new Set(['12345678000190']),
  targetRoots: new Set(['12345678']),
};

test('stream parser preserves quoted delimiters, escaped quotes and embedded newlines', async () => {
  const rows: string[][] = [];
  for await (const row of parseDelimitedText(chunks(
    'cnpj;nome;objeto\n12345678000190;"Empresa; Teste";"Linha 1',
    '\nLinha 2 com ""aspas"""\n',
  ), ';')) rows.push(row);

  assert.deepEqual(rows, [
    ['cnpj', 'nome', 'objeto'],
    ['12345678000190', 'Empresa; Teste', 'Linha 1\nLinha 2 com "aspas"'],
  ]);
});

test('BNDES normalization matches Company Master CNPJ and creates financing evidence', () => {
  const record = normalizePublicBulkRow({
    datasetCode: 'bndes_financing_operations',
    resource: resource(),
    ...targets,
    row: {
      cpf_cnpj: '12.345.678/0001-90',
      cliente: 'Empresa Teste S.A.',
      data_da_contratacao: '15/06/2026',
      valor_da_operacao_em_reais: '1.250.000,50',
      valor_desembolsado_reais: '900.000,00',
      produto: 'BNDES Automático',
      instrumento_financeiro: 'Financiamento',
      situacao_da_operacao: 'Ativa',
    },
  });

  assert.ok(record);
  assert.equal(record.entityCnpj, '12345678000190');
  assert.equal(record.recordType, 'bndes_financing');
  assert.equal(record.referenceDate, '2026-06-15');
  assert.equal(record.amount, 1_250_000.50);
  assert.equal(record.sourceCode, 'src_bndes_financing_operations');
});

test('PGFN normalization ignores unrelated CNPJs and preserves fiscal stress attributes', () => {
  const ignored = normalizePublicBulkRow({
    datasetCode: 'pgfn_debt',
    resource: resource(),
    ...targets,
    row: { cpf_cnpj: '00.000.000/0001-00', nome_devedor: 'Outro', valor_consolidado: '100,00' },
  });
  assert.equal(ignored, null);

  const matched = normalizePublicBulkRow({
    datasetCode: 'pgfn_debt',
    resource: resource(),
    ...targets,
    row: {
      cpf_cnpj: '12.345.678/0001-90',
      nome_devedor: 'Empresa Teste',
      numero_inscricao: '80.1.26.000001-00',
      data_inscricao: '20260131',
      valor_consolidado: '250000,35',
      situacao_inscricao: 'ATIVA NAO AJUIZADA',
    },
  });
  assert.ok(matched);
  assert.equal(matched.recordType, 'pgfn_debt');
  assert.equal(matched.amount, 250000.35);
  assert.equal(matched.status, 'ATIVA NAO AJUIZADA');
});

test('RFB company root matches a full Company Master CNPJ without generating a fake full CNPJ', () => {
  const record = normalizePublicBulkRow({
    datasetCode: 'rfb_cnpj',
    resource: resource({ name: 'K3241.K03200Y0.D60713.EMPRECSV' }),
    ...targets,
    row: {
      cnpj_basico: '12345678',
      razao_social: 'EMPRESA TESTE SA',
      natureza_juridica: '2054',
      capital_social: '1000000,00',
      porte_empresa: '03',
    },
  });
  assert.ok(record);
  assert.equal(record.entityCnpj, '12345678');
  assert.equal(record.recordType, 'rfb_company_snapshot');
  assert.equal(record.amount, 1_000_000);
});

test('CGU sanction and public contract produce distinct record families', () => {
  const sanction = normalizePublicBulkRow({
    datasetCode: 'cgu_ceis',
    resource: resource(),
    ...targets,
    row: {
      cpf_ou_cnpj_do_sancionado: '12.345.678/0001-90',
      nome_do_sancionado: 'Empresa Teste',
      categoria_da_sancao: 'Suspensão',
      orgao_sancionador: 'Órgão Federal',
      data_inicio_sancao: '01/07/2026',
    },
  });
  const contract = normalizePublicBulkRow({
    datasetCode: 'compras_contracts',
    resource: resource(),
    ...targets,
    row: {
      cnpj_contratado: '12.345.678/0001-90',
      nome_contratado: 'Empresa Teste',
      numero_contrato: '123/2026',
      data_assinatura: '02/07/2026',
      valor_global: '500.000,00',
      objeto: 'Serviços de tecnologia',
    },
  });
  assert.equal(sanction?.recordType, 'cgu_ceis');
  assert.equal(contract?.recordType, 'public_contract');
  assert.notEqual(sanction?.recordKey, contract?.recordKey);
});
