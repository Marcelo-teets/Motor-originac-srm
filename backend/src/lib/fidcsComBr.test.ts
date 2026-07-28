import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCnpj, normalizeCnpj, parseFidcsFundHtml } from './fidcsComBr.js';

test('normaliza e formata CNPJ', () => {
  assert.equal(normalizeCnpj('63.350.255/0001-02'), '63350255000102');
  assert.equal(formatCnpj('63350255000102'), '63.350.255/0001-02');
});

test('extrai snapshot público sem promover FIDCS a fonte canônica', () => {
  const html = `<html><body>
    <h1>Fundo MERCADO CRÉDITO ESTRUTURADO - 63.350.255/0001-02</h1>
    <p>63.350.255/0001-02 Em Funcionamento Normal</p>
    <p>Failed to send a request to the Edge Function</p>
    <p>O que é o MERCADO CRÉDITO ESTRUTURADO?</p>
    <p>O MERCADO CRÉDITO ESTRUTURADO (CNPJ 63.350.255/0001-02) é um Fundo de Investimento em Direitos Creditórios (FIDC), gerido pela POLÍGONO CAPITAL LTDA e administrado por BTG PACTUAL SERVIÇOS FINANCEIROS S/A DTVM. Possui patrimônio líquido de R$ 120,86 mi. Conta atualmente com 8 cotistas.</p>
    <p>O CNPJ do MERCADO CRÉDITO ESTRUTURADO FUNDO DE INVESTIMENTO EM DIREITOS CREDITÓRIOS RESPONSABILIDADE LIMITADA é 63.350.255/0001-02.</p>
    <p>A taxa de inadimplência atual do MERCADO CRÉDITO ESTRUTURADO é de 2,35%. A provisão para devedores duvidosos (PDD) corresponde a 3,10% da carteira.</p>
  </body></html>`;
  const snapshot = parseFidcsFundHtml(html, '63350255000102', 'https://fidcs.com.br/fundo/63350255000102', '2026-07-28T12:00:00.000Z');
  assert.equal(snapshot.canonicalUpstream, 'CVM');
  assert.equal(snapshot.fundName, 'MERCADO CRÉDITO ESTRUTURADO');
  assert.equal(snapshot.manager, 'POLÍGONO CAPITAL LTDA');
  assert.equal(snapshot.administrator, 'BTG PACTUAL SERVIÇOS FINANCEIROS S/A DTVM');
  assert.equal(snapshot.netAssetValueBrl, 120_860_000);
  assert.equal(snapshot.shareholdersCount, 8);
  assert.equal(snapshot.defaultRatePercent, 2.35);
  assert.equal(snapshot.pddPercent, 3.1);
  assert.equal(snapshot.providerEdgeWarning, true);
  assert.equal(snapshot.sourceConfidence, 0.75);
});

test('rejeita página de outro fundo', () => {
  assert.throws(() => parseFidcsFundHtml('<p>11.111.111/0001-11</p>', '63350255000102', 'https://fidcs.com.br/fundo/63350255000102'));
});
