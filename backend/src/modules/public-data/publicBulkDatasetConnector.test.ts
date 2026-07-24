import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoverPublicBulkResources,
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

const withMockedFetch = async <T>(
  mock: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  callback: () => Promise<T>,
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('BNDES normalization matches the automatic-operation schema', () => {
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

test('BNDES normalization supports the lighter nonautomatic-operation schema', () => {
  const record = normalizePublicBulkRow({
    datasetCode: 'bndes_financing_operations',
    resource: resource(),
    ...targets,
    row: {
      cnpj: '12.345.678/0001-90',
      cliente: 'Empresa Teste S.A.',
      numero_do_contrato: '2026123456',
      data_da_contratacao: '20/06/2026',
      valor_contratado_reais: '2.500.000,00',
      valor_desembolsado_reais: '1.750.000,00',
      situacao_do_contrato: 'Em desembolso',
      descricao_do_projeto: 'Expansão de capacidade',
    },
  });

  assert.ok(record);
  assert.equal(record.entityCnpj, '12345678000190');
  assert.equal(record.amount, 2_500_000);
  assert.equal(record.status, 'Em desembolso');
  assert.equal(record.normalizedPayload.contractNumber, '2026123456');
  assert.equal(record.normalizedPayload.projectDescription, 'Expansão de capacidade');
});

test('BNDES discovery falls back to the official dataset page and prioritizes the light nonautomatic CSV', async () => {
  await withMockedFetch(async (input) => {
    const url = String(input);
    if (url.includes('/api/3/action/package_show')) return new Response('', { status: 503 });
    if (url.endsWith('/dataset/operacoes-financiamento')) {
      return new Response(`
        <a href="/dataset/x/resource/automatic/download/operacoes-financiamento-operacoes-indiretas-automaticas.csv">automatic</a>
        <a href="/dataset/x/resource/nonautomatic/download/operacoes-financiamento-operacoes-nao-automaticas.csv">nonautomatic</a>
      `, { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const resources = await discoverPublicBulkResources('bndes_financing_operations', { maxResources: 1 });
    assert.equal(resources.length, 1);
    assert.match(resources[0].url, /nao-automaticas\.csv$/);
    assert.equal(resources[0].format, 'csv');
    assert.equal(resources[0].delimiter, ';');
  });
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

test('Compras discovery uses the official monthly slug and selects only the main contract file', async () => {
  await withMockedFetch(async (input, init) => {
    const url = String(input);
    assert.equal(init?.method, 'HEAD');
    assert.match(url, /\/download-de-dados\/compras\/202606$/);
    return new Response('', {
      status: 200,
      headers: { 'last-modified': 'Wed, 01 Jul 2026 00:00:00 GMT', etag: 'compras-202606' },
    });
  }, async () => {
    const resources = await discoverPublicBulkResources('compras_contracts', {
      reference: '2026-06',
      maxResources: 1,
    });
    assert.equal(resources.length, 1);
    assert.equal(resources[0].referenceDate, '2026-06-01');
    const pattern = new RegExp(resources[0].archiveEntryPattern ?? '', 'i');
    assert.equal(pattern.test('202606_Compras.csv'), true);
    assert.equal(pattern.test('202606_ItemCompra.csv'), false);
    assert.equal(pattern.test('202606_TermoAditivo.csv'), false);
  });
});

test('CGU sanction and official Compras contract headers produce distinct record families', () => {
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
      codigo_contratado: '12.345.678/0001-90',
      nome_contratado: 'Empresa Teste',
      numero_do_contrato: '123/2026',
      situacao_contrato: 'Ativo',
      nome_orgao_superior: 'Ministério Teste',
      nome_orgao: 'Órgão Teste',
      nome_ug: 'UG Teste',
      data_assinatura_contrato: '02/07/2026',
      data_inicio_da_vigencia: '03/07/2026',
      data_fim_da_vigencia: '03/07/2027',
      valor_inicial_da_compra: '450.000,00',
      valor_final_da_compra: '500.000,00',
      objeto: 'Serviços de tecnologia',
    },
  });
  assert.equal(sanction?.recordType, 'cgu_ceis');
  assert.equal(contract?.recordType, 'public_contract');
  assert.equal(contract?.amount, 500_000);
  assert.equal(contract?.status, 'Ativo');
  assert.equal(contract?.normalizedPayload.contractingBody, 'Ministério Teste');
  assert.equal(contract?.normalizedPayload.endDate, '2027-07-03');
  assert.notEqual(sanction?.recordKey, contract?.recordKey);
});
