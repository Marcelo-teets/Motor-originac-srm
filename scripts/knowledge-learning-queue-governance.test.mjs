import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const queueMigration = readFileSync(new URL('../db/migrations/117_govern_knowledge_learning_queue.sql', import.meta.url), 'utf8');
const billingMigration = readFileSync(new URL('../db/migrations/118_circuit_break_knowledge_provider_billing.sql', import.meta.url), 'utf8');
const securityMigration = readFileSync(new URL('../db/migrations/119_harden_knowledge_learning_governance_security.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/knowledge-learning-agent.yml', import.meta.url), 'utf8');

assert.match(queueMigration, /is_company_learning_eligible/, 'queue must use a canonical company learning gate');
assert.match(queueMigration, /metadata->>'data_status'.*'real'/s, 'only real companies may enter the learning queue');
assert.match(queueMigration, /metadata->>'synthetic_seed'.*<> 'true'/s, 'synthetic companies must be excluded');
assert.match(queueMigration, /metadata->>'monitoring_eligible'.*= 'true'/s, 'company must be monitoring-eligible');
assert.match(queueMigration, /status = 'dead_letter'.*company_not_learning_eligible/s, 'legacy mock jobs must be archived without deleting lineage');
assert.match(queueMigration, /provider_status.*blocked/s, 'claim must honor a global provider circuit breaker');
assert.match(queueMigration, /public\.is_company_learning_eligible\(job\.company_id\)/, 'claim must revalidate company eligibility');
assert.match(queueMigration, /attempts = greatest\(attempts - 1, 0\)/, 'provider deferral must not consume a job attempt');

assert.match(billingMigration, /valid credit card\|billing\|payment method\|insufficient credits/, 'billing failures must be classified as non-transient');
assert.match(billingMigration, /credential unavailable\|configure\.\*api_key/, 'missing provider credentials must also open the circuit');
assert.match(billingMigration, /knowledge_block_learning_provider/, 'runtime billing failures must open the circuit');
assert.match(billingMigration, /status = 'pending'.*attempts = greatest\(attempts - 1, 0\)/s, 'claimed jobs must be safely deferred on provider failure');
assert.match(billingMigration, /interval '6 hours'/, 'the observed provider failure must be globally throttled');

assert.match(securityMigration, /revoke execute on function public\.is_company_learning_eligible\(uuid\) from public, anon, authenticated/, 'internal learning helper must not be an authenticated RPC');
assert.match(securityMigration, /for all\s+to service_role\s+using \(true\)\s+with check \(true\)/s, 'runtime state must have an explicit service-role-only RLS policy');
assert.match(securityMigration, /revoke all on public\.knowledge_learning_runtime_state from public, anon, authenticated/, 'runtime state table must not leak to client roles');

assert.match(workflow, /default: '32'/, 'manual runs must default to a 32-event consolidation batch');
assert.match(workflow, /BATCH_SIZE: \$\{\{ inputs\.batch_size \|\| '32' \}\}/, 'scheduled runs must consolidate 32 events by default');
assert.match(workflow, /DAILY_LIMIT: \$\{\{ inputs\.daily_limit \|\| '48' \}\}/, 'company-level daily model budget must remain bounded');

console.log('Knowledge Learning queue, circuit-breaker, security, and batch contracts are protected.');
