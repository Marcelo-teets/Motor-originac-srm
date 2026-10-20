import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompanyAliases } from './companyAliasBuilder.js';
import type { CompanySeed } from '../../types/platform.js';

const company = (cnpj: string) => ({
  cnpj, legalName: 'Empresa verificada Ltda.', tradeName: 'Empresa Verificada',
  website: 'https://empresa.example.br',
} as CompanySeed);

test('alphanumeric and legacy CNPJs preserve unique canonical aliases', () => {
  const alpha = buildCompanyAliases(company('00.000.000/e08g-12'));
  assert.deepEqual(alpha.filter(item => item.aliasType === 'cnpj').map(item => item.aliasValue),
    ['00000000E08G12']);
  const numeric = buildCompanyAliases(company('11.444.777/0001-61'));
  assert.deepEqual(numeric.filter(item => item.aliasType === 'cnpj').map(item => item.aliasValue),
    ['11444777000161']);
});

test('invalid or altered CNPJ cannot introduce a false high-confidence entity alias', () => {
  const aliases = buildCompanyAliases(company('00.000.000/E08G-13'));
  assert.equal(aliases.some(item => item.aliasType === 'cnpj'), false);
});
