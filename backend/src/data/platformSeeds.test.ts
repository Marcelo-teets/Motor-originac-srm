import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCatalogSeeds } from './platformSeeds.js';
import { inferSourceCode } from '../lib/connectors.js';

const NEW_SOURCE_IDS = [
  'src_company_website_deep',
  'src_professional_network_company',
  'src_bcb_sgs',
  'src_pncp_contracts_api',
  'src_querido_diario_api',
  'src_vc_portfolio_monitor',
  'src_cvm_fidc_monthly',
  'src_cvm_fund_registry',
  'src_cvm_fundos_estruturados_medidas',
  'src_cvm_fundos_documentos_entrega',
  'src_anbima_fundos_estruturados',
  'src_anbima_fundos_icvm_555',
  'src_infosimples_cvm_participante',
  'src_portal_transparencia_api',
];

test('new catalog seeds carry explicit metadata.code equal to their id', () => {
  for (const id of NEW_SOURCE_IDS) {
    const seed = sourceCatalogSeeds.find((entry) => entry.id === id);
    assert.ok(seed, `missing seed ${id}`);
    assert.equal(seed.metadata.code, id);
  }
});

test('inferSourceCode resolves new seeds to their own code (no src_cvm_rss collision)', () => {
  for (const id of NEW_SOURCE_IDS) {
    const seed = sourceCatalogSeeds.find((entry) => entry.id === id);
    assert.ok(seed, `missing seed ${id}`);
    assert.equal(inferSourceCode(seed), id);
  }
});

test('token-gated FIDC seeds stay planned so the runtime keeps them inert', () => {
  for (const id of ['src_anbima_fundos_estruturados', 'src_anbima_fundos_icvm_555', 'src_infosimples_cvm_participante', 'src_portal_transparencia_api']) {
    const seed = sourceCatalogSeeds.find((entry) => entry.id === id);
    assert.ok(seed, `missing seed ${id}`);
    assert.equal(seed.status, 'planned');
  }
});

test('source catalog codes are unique', () => {
  const codes = sourceCatalogSeeds
    .map((entry) => (typeof entry.metadata?.code === 'string' ? entry.metadata.code : entry.id));
  assert.equal(new Set(codes).size, codes.length);
});
