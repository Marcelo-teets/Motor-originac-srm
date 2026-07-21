import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWebsitePath, detectSignals } from './originationSignalDetectors.js';

test('detectSignals finds credit, receivables and embedded finance families in PT text', () => {
  const text = [
    'Oferecemos crédito e financiamento com capital de giro para empresas.',
    'Antecipação de recebíveis de duplicata direto no checkout com Pix.',
  ].join(' ');

  const signals = detectSignals(text, 'https://example.com/produto', 'company_website');
  const types = signals.map((signal) => signal.type);

  assert.ok(types.includes('credit_product_signal'));
  assert.ok(types.includes('receivables_signal'));
  assert.ok(types.includes('embedded_finance_signal'));

  const receivables = signals.find((signal) => signal.type === 'receivables_signal');
  assert.ok(receivables);
  assert.ok(receivables.matchedKeywords.length >= 2);
  assert.ok(receivables.strength >= 88);
  assert.equal(receivables.sourceUrl, 'https://example.com/produto');
  assert.equal(receivables.sourceType, 'company_website');
});

test('detectSignals returns empty for text without any keyword family', () => {
  assert.deepEqual(detectSignals('nada relevante por aqui', 'https://example.com', 'company_website'), []);
  assert.deepEqual(detectSignals('', 'https://example.com', 'company_website'), []);
});

test('classifyWebsitePath maps known path segments', () => {
  assert.equal(classifyWebsitePath('https://example.com/sobre'), 'about');
  assert.equal(classifyWebsitePath('https://example.com/products/x'), 'products');
  assert.equal(classifyWebsitePath('https://example.com/empresas'), 'enterprise');
  assert.equal(classifyWebsitePath('https://example.com/carreiras'), 'careers');
  assert.equal(classifyWebsitePath('https://example.com/xyz'), 'unknown');
});
