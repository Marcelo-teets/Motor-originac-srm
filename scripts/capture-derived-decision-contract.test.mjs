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
  /import \{ filterCaptureResultsForEntityRelevance \} from '\.\.\/modules\/data-capture\/captureEntityRelevanceGate\.js';/,
  'capture runtime must apply semantic company relevance before signals can affect decision layers',
);
assert.match(
  runtimeSource,
  /const prePersistenceEntityGate = filterCaptureResultsForEntityRelevance\(captureResults, targetCompanies\);/,
  'semantic relevance must be evaluated before company signals and enrichments are persisted',
);
assert.match(
  runtimeSource,
  /signals: prePersistenceEntityGate\.results\[index\]\?\.signals \?\? \[\],/,
  'only company-relevant signals may enter persistence and database Factor Map triggers',
);
assert.match(
  runtimeSource,
  /enrichments: prePersistenceEntityGate\.results\[index\]\?\.enrichments \?\? \[\],/,
  'only company-relevant enrichments may enter persistence',
);
assert.match(
  runtimeSource,
  /const persisted = await this\.persistence\.persist\(persistenceCaptureResults, reason\);/,
  'raw outputs remain in persistenceCaptureResults while semantic artifacts are filtered before insert',
);
assert.match(
  runtimeSource,
  /const qualityDecisionResults = filterCaptureResultsForDecision\(captureResults, persisted\.decisionGate\);/,
  'raw capture outputs must be filtered by persistence quality gates before decision derivation',
);
assert.match(
  runtimeSource,
  /const entityRelevanceGate = filterCaptureResultsForEntityRelevance\(qualityDecisionResults, targetCompanies\);/,
  'quality-approved evidence must also pass semantic entity relevance before derivation',
);
assert.match(
  runtimeSource,
  /const decisionCaptureResults = entityRelevanceGate\.results;/,
  'the final decision capture set must be the entity-relevant subset',
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
  'CaptureDerivedSyncService must receive only quality-approved and entity-relevant evidence',
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
  /signalsEntityRelevantForPersistence:/,
  'runtime output must expose how many signals survived semantic relevance before persistence',
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

console.log('Capture raw evidence, entity relevance, evidence quality and decision derivation remain explicitly separated.');
