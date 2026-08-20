import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../db/migrations/145_entity_relevance_v3_historical_remediation.sql', import.meta.url), 'utf8');

assert.match(migration, /ENTITY_RELEVANCE_V3_QUARANTINE/, 'remediation must preserve an explicit audit rule');
assert.match(migration, /insert into public\.data_quality_violations/i, 'removed analytical signals must be copied to the data quality audit trail first');
assert.match(migration, /'signal', q\.signal_json/, 'audit trail must preserve the complete company_signal payload');
assert.match(migration, /delete from public\.company_signals/i, 'remediation may delete the invalid derived signal after audit preservation');
assert.doesNotMatch(migration, /delete from public\.monitoring_outputs/i, 'raw monitoring outputs must never be deleted by entity relevance remediation');
assert.doesNotMatch(migration, /delete from public\.source_documents/i, 'raw source documents must never be deleted by entity relevance remediation');
assert.doesNotMatch(migration, /delete from public\.data_treatment_results/i, 'treatment audit must never be deleted by entity relevance remediation');
assert.match(migration, /src_bcb_sgs/, 'macro BCB context must be explicitly separated from company evidence');
assert.match(migration, /src_mais_retorno_api/, 'market context sources must remain outside company-specific signals');
assert.match(migration, /capture_treatment_v2/, 'historical treatment signals must be re-grounded against company-matched items');
assert.match(migration, /tmp_entity_relevance_v3_company_aliases/, 'historical remediation must use deterministic aliases instead of full-name-only matching');
assert.match(migration, /website_hostish/, 'official domain aliases must participate in historical entity resolution');
assert.match(migration, /separator_alias/, 'hyphen/acronym aliases such as CASAN must participate in historical entity resolution');
assert.match(migration, /enqueue_company_origination_reprocessing/i, 'affected companies must be queued for canonical analytical rebuild');
assert.doesNotMatch(migration, /process_origination_reprocessing_queue\s*\(/i, 'heavy reprocessing must run in bounded post-migration batches, not inside the migration transaction');

console.log('Entity relevance historical remediation preserves raw evidence, audits removals, and queues bounded canonical rebuilds.');
