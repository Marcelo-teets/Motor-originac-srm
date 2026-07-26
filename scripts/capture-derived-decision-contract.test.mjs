import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtimeSource = readFileSync(new URL('../backend/src/services/captureRuntimeService.ts', import.meta.url), 'utf8');

assert.match(
  runtimeSource,
  /import \{ isCompanyDecisionEligible \} from '\.\.\/lib\/companyDecisionEligibility\.js';/,
  'capture runtime must use the canonical Company Master decision gate',
);
assert.match(
  runtimeSource,
  /const decisionCompanies = targetCompanies\.filter\(isCompanyDecisionEligible\);/,
  'monitoring-eligible companies must be filtered before decision artifacts are derived',
);
assert.match(
  runtimeSource,
  /companies: decisionCompanies,/,
  'CaptureDerivedSyncService must receive only decision-eligible companies',
);
assert.doesNotMatch(
  runtimeSource,
  /derivedSync\.sync\(\{[\s\S]{0,200}companies: targetCompanies,/,
  'the raw monitoring target list must never be passed into qualification/score/pipeline sync',
);
assert.match(
  runtimeSource,
  /companiesSkippedFromDerivedDecision:/,
  'runtime output must expose how many monitored companies were intentionally skipped from decision derivation',
);

console.log('Capture monitoring and decision derivation remain separated.');
