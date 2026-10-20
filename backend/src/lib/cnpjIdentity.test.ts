import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidCnpjIdentity, normalizeCnpjIdentity } from './cnpjIdentity.js';

test('validates real official RFB alphanumeric CNPJ issued in July 2026', () => {
  assert.equal(normalizeCnpjIdentity('00.000.000/e08g-12'), '00000000E08G12');
  assert.equal(isValidCnpjIdentity('00.000.000/E08G-12'), true);
  assert.equal(isValidCnpjIdentity('12.ABC.345/01DE-35'), true);
  assert.equal(isValidCnpjIdentity('11.444.777/0001-61'), true);
});

test('rejects malformed, truncated or checksum-invalid identifiers without stripping letters', () => {
  for (const bad of ['00.000.000/E08G-13','12.ABC.345/01DE-36','11444777000162',
    '00000000000000','11@444777000161','00.000.000/E08G', '']) {
    assert.equal(isValidCnpjIdentity(bad), false, bad);
  }
  assert.equal(isValidCnpjIdentity(null), false);
  assert.equal(normalizeCnpjIdentity('00.000.000/E08G-12'), '00000000E08G12');
});
