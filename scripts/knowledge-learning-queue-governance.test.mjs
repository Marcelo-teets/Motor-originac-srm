import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const queueMigration = readFileSync(new URL('../db/migrations/117_govern_knowledge_learning_queue.sql', import.meta.url), 'utf8');
const billingMigration = readFileSync(new URL('../db/migrations/118_circuit_break_knowledge_provider_billing.sql', import.meta.url), 'utf8');

assert.match(queueMigration, /is_company_learning_eligible/, 'queue must use a canonical company learning gate');
assert.match(queueMigration, /metadata->>'data_status'.*'real'/s, 'only real companies may enter the learning queue');
assert.match(queueMigration, /metadata->>'synthetic_seed'.*<> 'true'/s, 'synthetic companies must be excluded');
assert.match(queueMigration, /metadata->>'monitoring_eligible'.*= 'true'/s, 'company must be monitoring-eligible');
assert.match(queueMigration, /status = 'dead_letter'.*company_not_learning_eligible/s, 'legacy mock jobs must be archived without deleting lineage');
assert.match(queueMigration, /provider_status.*blocked/s, 'claim must honor a global provider circuit breaker');
assert.match(queueMigration, /public\.is_company_learning_eligible\(job\.company_id\)/, 'claim must revalidate company eligibility');
assert.match(queueMigration, /attempts = greatest\(attempts - 1, 0\)/, 'provider deferral must not consume a job attempt');

assert.match(billingMigration, /valid credit card\|billing\|payment method\|insufficient credits/, 'billing failures must be classified as non-transient');
assert.match(billingMigration, /knowledge_block_learning_provider/, 'runtime billing failures must open the provider circuit');
assert.match(billingMigration, /status = 'pending'.*attempts = greatest\(attempts - 1, 0\)/s, 'claimed jobs must be safely deferred on billing failure');
assert.match(billingMigration, /interval '6 hours'/, 'the observed billing failure must be globally throttled');

console.log('Knowledge Learning queue and provider circuit-breaker contracts are protected.');
