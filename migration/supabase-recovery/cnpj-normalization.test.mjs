import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalCnpjKey } from './cnpj-normalization.mjs';
import { evaluateIdentityReconciliation } from './identity-reconciliation-preflight.mjs';

test('migration preflight preserves 2026 RFB alphanumeric keys and validates their digits', () => {
  assert.equal(canonicalCnpjKey('00.000.000/e08g-12'), '00000000E08G12');
  assert.equal(canonicalCnpjKey('12.ABC.345/01DE-35'), '12ABC34501DE35');
  assert.equal(canonicalCnpjKey('11.444.777/0001-61'), '11444777000161');
  assert.equal(canonicalCnpjKey('00.000.000/E08G-13'), '');
  assert.equal(canonicalCnpjKey('12.ABC.345/01DE-36'), '');
  assert.equal(canonicalCnpjKey('11.444.777/0001-62'), '');
  assert.equal(canonicalCnpjKey('00.000.000/E08G-XX'), '');
  assert.equal(canonicalCnpjKey('invalid'), '');
});

test('legitimate alphanumeric registration matches across punctuation and case, but never automatically approves a cutover', () => {
  const report = evaluateIdentityReconciliation(
    { companies:[{id:'old',cnpj:'00.000.000/E08G-12'}], sources:[] },
    { companies:[{id:'new',cnpj:'00000000e08g12'}], sources:[] },
  );
  assert.equal(report.companies.matchedCnpj,1);
  assert.equal(report.companies.matchedCnpjDifferentUuid,1);
  assert.equal(report.importAllowed,false);
  assert.doesNotMatch(JSON.stringify(report),/00000000E08G12/);
});
