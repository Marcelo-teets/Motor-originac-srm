import assert from 'node:assert/strict';
import test from 'node:test';
import { uniqueAffectedCompanyIds } from './publicDataDownstreamService.js';

test('uniqueAffectedCompanyIds removes nulls and duplicate company matches', () => {
  assert.deepEqual(uniqueAffectedCompanyIds([
    { company_id: 'company-a', dataset_code: 'cgu_ceis' },
    { company_id: null, dataset_code: 'cgu_ceis' },
    { company_id: 'company-a', dataset_code: 'cgu_cnep' },
    { company_id: 'company-b', dataset_code: 'compras_contracts' },
  ]), ['company-a', 'company-b']);
});

test('uniqueAffectedCompanyIds returns an empty list without Company Master matches', () => {
  assert.deepEqual(uniqueAffectedCompanyIds([
    { company_id: null, dataset_code: 'pgfn_debt' },
  ]), []);
});
