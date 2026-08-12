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
  /import \{ filterCaptureResultsForDecision \} from '\.\.\/modules\/data-capture\/captureDecisionGate\.js';/,
  'capture runtime must also apply the per-output evidence decision gate',
);
assert.match(
  runtimeSource,
  /const decisionCaptureResults = filterCaptureResultsForDecision\(captureResults, persisted\.decisionGate\);/,
  'raw capture results must be filtered after persistence quality gates and before decision derivation',
);
assert.match(
  runtimeSource,
  /isCompanyDecisionEligible\(company\) && companiesWithEligibleEvidence\.has\(company\.id\)/,
  'derived decision artifacts require both Company Master eligibility and at least one eligible evidence output',
);
assert.match(
  runtimeSource,
  /companies: decisionCompanies,/,
  'CaptureDerivedSyncService must receive only decision-eligible companies',
);
assert.match(
  runtimeSource,
  /captureResults: decisionCaptureResults,/,
  'CaptureDerivedSyncService must receive only quality-approved evidence',
);
assert.doesNotMatch(
  runtimeSource,
  /derivedSync\.sync\(\{[\s\S]{0,300}companies: targetCompanies,/,
  'the raw monitoring target list must never be passed into qualification/score/pipeline sync',
);
assert.doesNotMatch(
  runtimeSource,
  /derivedSync\.sync\(\{[\s\S]{0,400}captureResults,\s*[\s\S]{0,100}reason,/,
  'unfiltered capture results must never be passed into qualification/score/pipeline sync',
);
assert.match(
  runtimeSource,
  /outputsDecisionEligible:/,
  'runtime output must expose the evidence volume promoted to decision layers',
);
assert.match(
  runtimeSource,
  /companiesSkippedFromDerivedDecision:/,
  'runtime output must expose how many monitored companies were intentionally skipped from decision derivation',
);

console.log('Capture monitoring, evidence quality and decision derivation remain explicitly separated.');
