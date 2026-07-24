import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyFinepSheet,
  normalizeFinepHeader,
  normalizeFinepPublicRow,
  parseFinepDate,
  type FinepPublicResource,
} from './finepPublicDataConnector.js';

const resource = (kind: 'operations' | 'disbursements'): FinepPublicResource => ({
  kind,
  key: `finep:${kind}`,
  name: kind,
  url: kind === 'operations'
    ? 'https://download.finep.gov.br/Contratacao.xlsx'
    : 'https://download.finep.gov.br/Liberacao.xlsx',
  pageUrl: 'https://legacy.finep.gov.br/transparencia-finep/paineis-e-downloads/central-de-downloads',
  referenceDate: '2026-07-20',
  modifiedAt: 'Mon, 20 Jul 2026 16:40:45 GMT',
  etag: 'test',
  format: 'xlsx',
});

const targets = {
  targetCnpjs: new Set(['17770708000124']),
  targetRoots: new Set(['17770708']),
};
const normalizedRow = (input: Record<string, string>) => Object.fromEntries(
  Object.entries(input).map(([key, value]) => [normalizeFinepHeader(key), value]),
);

test('classifies all financially distinct Finep sheets', () => {
  assert.equal(classifyFinepSheet('Projetos_Crédito_Direto'), 'credit_direct');
  assert.equal(classifyFinepSheet('Projetos Créd. Descentralizado'), 'credit_decentralized');
  assert.equal(classifyFinepSheet('Crd_-_Condições_Fincanciamento'), 'credit_terms');
  assert.equal(classifyFinepSheet('Projetos_Subv__Descentralizada'), 'grant_decentralized');
  assert.equal(classifyFinepSheet('Investimento_Direto_(Startups)'), 'direct_investment');
  assert.equal(classifyFinepSheet('Guia_de_Leitura'), null);
});

test('normalizes reimbursable direct credit without inferring a funding gap', () => {
  const record = normalizeFinepPublicRow({
    resource: resource('operations'),
    sheetName: 'Projetos_Crédito_Direto',
    category: 'credit_direct',
    row: normalizedRow({
      Contrato: '01.26.0001.00',
      'Data Assinatura': '17/07/2026',
      Proponente: 'Creditas Soluções Ltda.',
      'CNPJ Proponente': '17.770.708/0001-24',
      Título: 'Plataforma de inovação financeira',
      'Valor Finep': '25.000.000,00',
      'Valor Pago': '10.000.000,00',
      Status: 'Em execução',
    }),
    ...targets,
  });
  assert.ok(record);
  assert.equal(record.recordType, 'finep_credit_operation');
  assert.equal(record.entityCnpj, '17770708000124');
  assert.equal(record.referenceDate, '2026-07-17');
  assert.equal(record.amount, 25_000_000);
  assert.equal(record.normalizedPayload.fundingNature, 'reimbursable_credit');
  assert.equal(record.normalizedPayload.amountDisbursed, 10_000_000);
  assert.equal('fundingGap' in record.normalizedPayload, false);
});

test('keeps non-reimbursable grants distinct from debt', () => {
  const record = normalizeFinepPublicRow({
    resource: resource('operations'),
    sheetName: 'Projetos_Subv__Descentralizada',
    category: 'grant_decentralized',
    row: normalizedRow({
      'Referência Projeto': 'SUBV-123',
      'CNPJ Beneficiário': '17.770.708/0001-24',
      'Razão Social': 'Creditas Soluções Ltda.',
      'Participação Finep': '2.500.000,00',
      'Data assinatura': '15/06/2026',
      'Nome do coordenador': 'Pessoa que não deve ser persistida',
    }),
    ...targets,
  });
  assert.ok(record);
  assert.equal(record.recordType, 'finep_grant_operation');
  assert.equal(record.normalizedPayload.fundingNature, 'non_reimbursable_grant');
  assert.equal(JSON.stringify(record.rawPayload).includes('Pessoa que não deve ser persistida'), false);
});

test('normalizes disbursements as execution evidence', () => {
  const record = normalizeFinepPublicRow({
    resource: resource('disbursements'),
    sheetName: 'Projetos Crédito Direto',
    category: 'credit_direct',
    row: normalizedRow({
      Contrato: '01.26.0001.00',
      Proponente: 'Creditas Soluções Ltda.',
      'CNPJ Proponente': '17.770.708/0001-24',
      'Nº Parcela': '2',
      'Nº Liberação': '3',
      'Data Liberação': '20/07/2026',
      'Valor Liberado': '4.750.000,00',
    }),
    ...targets,
  });
  assert.ok(record);
  assert.equal(record.recordType, 'finep_disbursement');
  assert.equal(record.amount, 4_750_000);
  assert.equal(record.normalizedPayload.releasedAt, '2026-07-20');
  assert.equal(record.normalizedPayload.releaseNumber, '3');
});

test('rejects rows outside the governed Company Master targets', () => {
  const record = normalizeFinepPublicRow({
    resource: resource('operations'),
    sheetName: 'Investimento_Direto_(Startups)',
    category: 'direct_investment',
    row: normalizedRow({ CNPJ: '11.111.111/0001-11', 'Razão Social': 'Outra Empresa' }),
    ...targets,
  });
  assert.equal(record, null);
});

test('parses Excel serial dates deterministically', () => {
  assert.equal(parseFinepDate('17/07/2026'), '2026-07-17');
  assert.equal(parseFinepDate('46220'), '2026-07-17');
});
