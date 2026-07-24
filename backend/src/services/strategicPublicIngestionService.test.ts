import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isEligibleStrategicMonitoringTarget,
  isValidCnpj,
  normalizeCnpj,
  type StrategicTargetCompanyRow,
} from './strategicPublicIngestionService.js';

const realReviewedCompany = (overrides: Partial<StrategicTargetCompanyRow> = {}): StrategicTargetCompanyRow => ({
  id: 'fdac3e35-1d23-41d1-a9fd-0376445d3992',
  cnpj: '17.770.708/0001-24',
  metadata: {
    data_status: 'real',
    synthetic_seed: false,
    identity_verified: true,
    monitoring_eligible: true,
    excluded_from_monitoring: false,
    entity_resolution_eligible: true,
    decision_eligible: false,
    excluded_from_qualification: true,
  },
  ...overrides,
});

test('normalizes and validates a real CNPJ', () => {
  assert.equal(normalizeCnpj('17.770.708/0001-24'), '17770708000124');
  assert.equal(isValidCnpj('17.770.708/0001-24'), true);
});

test('rejects synthetic and checksum-invalid CNPJs', () => {
  assert.equal(isValidCnpj('12.345.678/0001-01'), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(isValidCnpj(null), false);
});

test('accepts identity-reviewed companies for monitoring before credit qualification', () => {
  const company = realReviewedCompany();
  assert.equal(company.metadata?.decision_eligible, false);
  assert.equal(company.metadata?.excluded_from_qualification, true);
  assert.equal(isEligibleStrategicMonitoringTarget(company), true);
});

test('rejects synthetic, unverified or monitoring-excluded companies', () => {
  assert.equal(isEligibleStrategicMonitoringTarget(realReviewedCompany({
    metadata: { ...realReviewedCompany().metadata, synthetic_seed: true },
  })), false);
  assert.equal(isEligibleStrategicMonitoringTarget(realReviewedCompany({
    metadata: { ...realReviewedCompany().metadata, identity_verified: false },
  })), false);
  assert.equal(isEligibleStrategicMonitoringTarget(realReviewedCompany({
    metadata: { ...realReviewedCompany().metadata, excluded_from_monitoring: true },
  })), false);
  assert.equal(isEligibleStrategicMonitoringTarget(realReviewedCompany({
    metadata: { ...realReviewedCompany().metadata, monitoring_eligible: false },
  })), false);
});

test('rejects valid CNPJs without explicit real-data governance metadata', () => {
  assert.equal(isEligibleStrategicMonitoringTarget({
    id: 'missing-governance',
    cnpj: '17770708000124',
    metadata: {},
  }), false);
});
