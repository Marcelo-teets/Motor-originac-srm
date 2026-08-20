import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const queueMigration = readFileSync(new URL('../db/migrations/117_govern_knowledge_learning_queue.sql', import.meta.url), 'utf8');
const billingMigration = readFileSync(new URL('../db/migrations/118_circuit_break_knowledge_provider_billing.sql', import.meta.url), 'utf8');
const securityMigration = readFileSync(new URL('../db/migrations/119_harden_knowledge_learning_governance_security.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/knowledge-learning-agent.yml', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../api/agentetome.ts', import.meta.url), 'utf8');

assert.match(queueMigration, /is_company_learning_eligible/, 'queue must use a canonical company learning gate');
assert.match(queueMigration, /metadata->>'data_status'.*'real'/s, 'only real companies may enter the learning queue');
assert.match(queueMigration, /metadata->>'synthetic_seed'.*<> 'true'/s, 'synthetic companies must be excluded');
assert.match(queueMigration, /metadata->>'monitoring_eligible'.*= 'true'/s, 'company must be monitoring-eligible');
assert.match(queueMigration, /status = 'dead_letter'.*company_not_learning_eligible/s, 'legacy mock jobs must be archived without deleting lineage');
assert.match(queueMigration, /provider_status.*blocked/s, 'claim must honor a global provider circuit breaker');
assert.match(queueMigration, /public\.is_company_learning_eligible\(job\.company_id\)/, 'claim must revalidate company eligibility');
assert.match(queueMigration, /attempts = greatest\(attempts - 1, 0\)/, 'provider deferral must not consume a job attempt');

// Historical paid-provider circuit breakers remain in migrations for database lineage.
// The active runtime is stricter: paid providers are disconnected entirely.
assert.match(billingMigration, /valid credit card\|billing\|payment method\|insufficient credits/, 'historical billing failures remain classified as non-transient');
assert.match(billingMigration, /credential unavailable\|configure\.\*api_key/, 'historical missing-provider credentials remain classifiable');
assert.match(billingMigration, /knowledge_block_learning_provider/, 'database circuit breaker lineage must remain intact');
assert.match(billingMigration, /status = 'pending'.*attempts = greatest\(attempts - 1, 0\)/s, 'historical claimed jobs remain safely deferrable');
assert.match(billingMigration, /interval '6 hours'/, 'historical provider failures remain globally throttled');

assert.match(securityMigration, /revoke execute on function public\.is_company_learning_eligible\(uuid\) from public, anon, authenticated/, 'internal learning helper must not be an authenticated RPC');
assert.match(securityMigration, /for all\s+to service_role\s+using \(true\)\s+with check \(true\)/s, 'runtime state must have an explicit service-role-only RLS policy');
assert.match(securityMigration, /revoke all on public\.knowledge_learning_runtime_state from public, anon, authenticated/, 'runtime state table must not leak to client roles');

assert.doesNotMatch(workflow, /\n\s*schedule\s*:/, 'zero-cost lock must keep scheduled Knowledge Learning disabled');
assert.doesNotMatch(workflow, /\/api\/knowledge-learning-agent/, 'zero-cost lock workflow must not emit an inference request');
assert.match(workflow, /zero-cost lock active/, 'workflow must make the policy lock explicit');
assert.match(workflow, /no inference and emits no paid-provider request/, 'workflow must state that it performs no paid inference');

assert.match(runtime, /return writeJson\(res, 423/, 'runtime must fail closed before Knowledge Learning inference');
assert.match(runtime, /paidProviderAttempted: false/, 'runtime must prove no paid provider attempt occurred');
assert.doesNotMatch(runtime, /runKnowledgeLearningAgent|knowledgeLearningAgent\.js|AI_GATEWAY_API_KEY|x-vercel-oidc-token/, 'paid Knowledge Learning runtime must remain disconnected');

console.log('Knowledge Learning queue, security, and zero-cost runtime contracts are protected.');
