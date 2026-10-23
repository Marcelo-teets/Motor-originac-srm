import assert from 'node:assert/strict';
import test from 'node:test';
import { findBestCompanyMatch } from './companyDiscoveryMatching.js';

const companies = [
  { id: 'alpha', name: 'Companhia Alfa', cnpj: '00.000.000/E08G-12', website: 'https://shared.example' },
  { id: 'legacy', name: 'Companhia Legada', cnpj: '17.770.708/0001-24', website: 'https://legacy.example' },
  { id: 'unknown', name: 'Empresa Sem CNPJ', website: 'https://unknown.example' },
];

test('matches the official RFB alphanumeric identifier without stripping letters', () => {
  assert.deepEqual(findBestCompanyMatch({
    companyName: 'Marca Diferente', cnpj: '00000000e08g12', website: 'https://other.example',
  }, companies), { companyId: 'alpha', confidence: 1, matchMethod: 'cnpj' });
});

test('does not link a truncated alpha CNPJ to a numeric fragment or shared website', () => {
  assert.equal(findBestCompanyMatch({
    companyName: 'Companhia Alfa', cnpj: '00.000.000/E08G-12', website: 'https://legacy.example',
  }, companies.filter(x => x.id !== 'alpha')), null);
  assert.equal(findBestCompanyMatch({
    companyName: 'Companhia Legada', cnpj: '000000000812', website: 'https://legacy.example',
  }, companies), null);
});

test('valid but conflicting CNPJ must override shared website and exact name', () => {
  assert.equal(findBestCompanyMatch({
    companyName: 'Companhia Legada', cnpj: '19.540.550/0001-21', website: 'https://legacy.example',
  }, companies), null);
  assert.equal(findBestCompanyMatch({
    companyName: 'Empresa Sem CNPJ', cnpj: '19.540.550/0001-21', website: 'https://unknown.example',
  }, companies), null);
});

test('malformed identifiers cannot be used to bypass identity via domain or brand', () => {
  for (const bad of ['00.000.000/E08G-13', '17.770.708/0001-25', 'garbage']) {
    assert.equal(findBestCompanyMatch({
      companyName: 'Companhia Alfa', cnpj: bad, website: 'https://shared.example',
    }, companies), null);
  }
});

test('legacy numeric identifiers and no-CNPJ website/name fallback remain operational', () => {
  assert.equal(findBestCompanyMatch({ companyName: 'Outra', cnpj: '17770708000124' }, companies)?.matchMethod, 'cnpj');
  assert.deepEqual(findBestCompanyMatch({ companyName: 'Outra', website: 'https://unknown.example/path' }, companies),
    { companyId: 'unknown', confidence: 0.99, matchMethod: 'website' });
  assert.deepEqual(findBestCompanyMatch({ companyName: 'Empresa Sem CNPJ' }, companies),
    { companyId: 'unknown', confidence: 0.94, matchMethod: 'exact_name' });
});
