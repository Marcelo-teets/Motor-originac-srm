import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CVM_DATASETS,
  normalizeCvmResourceName,
  selectDatasetResources,
} from './cvmDatasetRegistry.js';

test('normalizes a friendly CKAN resource name from the direct CSV URL', () => {
  const normalized = normalizeCvmResourceName({
    name: 'Documentos Eventuais de Fundos de Investimento (2026)',
    url: 'https://dados.cvm.gov.br/dados/FI/DOC/EVENTUAL/DADOS/eventual_fi_2026.csv',
    format: 'CSV',
  });

  assert.equal(normalized.name, 'eventual_fi_2026.csv');
});

test('keeps explicit resource filenames unchanged', () => {
  const normalized = normalizeCvmResourceName({
    name: 'fi_entrega_documento_202607.zip',
    url: 'https://dados.cvm.gov.br/dados/FI/DOC/ENTREGA/DADOS/fi_entrega_documento_202607.zip',
  });

  assert.equal(normalized.name, 'fi_entrega_documento_202607.zip');
});

test('selects all delivery resources from a requested year in newest-first order', () => {
  const selected = selectDatasetResources(CVM_DATASETS.cvm_fund_document_deliveries, [
    {
      name: 'Documentos Entregues por Fundos - maio',
      url: 'https://dados.cvm.gov.br/dados/FI/DOC/ENTREGA/DADOS/fi_entrega_documento_202605.zip',
      last_modified: '2026-07-01',
    },
    {
      name: 'Documentos Entregues por Fundos - julho',
      url: 'https://dados.cvm.gov.br/dados/FI/DOC/ENTREGA/DADOS/fi_entrega_documento_202607.zip',
      last_modified: '2026-07-28',
    },
    {
      name: 'Documentos Entregues por Fundos - junho',
      url: 'https://dados.cvm.gov.br/dados/FI/DOC/ENTREGA/DADOS/fi_entrega_documento_202606.zip',
      last_modified: '2026-07-27',
    },
    {
      name: 'Documentos Entregues por Fundos - dezembro anterior',
      url: 'https://dados.cvm.gov.br/dados/FI/DOC/ENTREGA/DADOS/fi_entrega_documento_202512.zip',
      last_modified: '2026-07-27',
    },
  ], '2026');

  assert.deepEqual(selected.map((resource) => resource.name), [
    'fi_entrega_documento_202607.zip',
    'fi_entrega_documento_202606.zip',
    'fi_entrega_documento_202605.zip',
  ]);
});
