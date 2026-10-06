import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHeader, parseDate, parseNumber, pick, rowObject, targetMatch } from './publicDataParsing.js';

test('parseNumber handles Brazilian currency, plain decimals and garbage', () => {
  assert.equal(parseNumber('R$ 1.234,56'), 1234.56); // the bulk connector used to return null here
  assert.equal(parseNumber('1.234.567,8'), 1234567.8);
  assert.equal(parseNumber('1234.5'), 1234.5);
  assert.equal(parseNumber('-12,5'), -12.5);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('n/d'), null);
});

test('parseDate normalizes compact, Brazilian and ISO dates', () => {
  assert.equal(parseDate('20260930'), '2026-09-30');
  assert.equal(parseDate('30/09/2026'), '2026-09-30');
  assert.equal(parseDate('2026-09-30T10:00:00Z'), '2026-09-30');
  assert.equal(parseDate('setembro'), null);
});

test('header normalization, row objects and target matching', () => {
  assert.equal(normalizeHeader('﻿Razão Social'), 'razao_social');
  const row = rowObject(['CNPJ', 'Razão Social'], ['  17770708000124 ', 'Demo   SA']);
  assert.deepEqual(row, { cnpj: '17770708000124', razao_social: 'Demo SA' });
  assert.equal(pick(row, ['Nome', 'Razão Social']), 'Demo SA');
  const targets = new Set(['17770708000124']);
  const roots = new Set(['17770708']);
  assert.equal(targetMatch('17770708000124', targets, roots), true);
  assert.equal(targetMatch('17770708000205', targets, roots), true);
  assert.equal(targetMatch('17770708', targets, roots), true);
  assert.equal(targetMatch('99999999000199', targets, roots), false);
});
