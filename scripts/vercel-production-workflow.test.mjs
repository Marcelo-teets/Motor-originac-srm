import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/vercel-production-deploy.yml', 'utf8');

assert.match(workflow, /VERCEL_CLI_VERSION:\s*50\.28\.0/, 'Vercel CLI must be pinned');
assert.match(workflow, /sync-public-auth-env-to-vercel\.mjs/, 'Workflow must synchronize canonical public Supabase Auth config before the build');
assert.match(workflow, /Synchronize canonical public Supabase Auth config[\s\S]*Link exact Vercel project/, 'Public Auth config must be synchronized before pulling Vercel production settings');
assert.match(workflow, /vercel@\$VERCEL_CLI_VERSION" pull/, 'Workflow must pull production settings');
assert.match(workflow, /vercel@\$VERCEL_CLI_VERSION" build[\s\S]*--prod/, 'Workflow must build a production artifact');
assert.match(workflow, /vercel@\$VERCEL_CLI_VERSION" deploy[\s\S]*--prebuilt[\s\S]*--prod/, 'Workflow must deploy the prebuilt artifact');
assert.match(workflow, /--env "GIT_SHA=\$REQUESTED_SHA"/, 'Runtime SHA must be injected into the deployment');
assert.match(workflow, /EXPECTED_SHA="\$REQUESTED_SHA"[\s\S]*REQUIRE_CAPTCHA_SITE_KEY=false[\s\S]*smoke-auth-production\.mjs/, 'Canonical Auth smoke must validate the requested SHA');
assert.match(workflow, /Run strict CAPTCHA smoke when configured/, 'Strict CAPTCHA compatibility check must remain non-blocking after retirement');
assert.match(workflow, /Disconnect legacy Git integration/, 'Workflow must include the legacy Git unlink step');
assert.match(workflow, /projectUrl\.pathname}\/link/, 'Workflow must target the Vercel project Git link endpoint');
assert.match(workflow, /method: 'DELETE'/, 'Workflow must remove the Vercel Git link with DELETE');
assert.match(workflow, /if \(after\.link\) throw new Error/, 'Workflow must verify the Git link was removed');
assert.match(workflow, /Confirm automatic deployments remain disabled[\s\S]*if: always\(\)/, 'Automatic deployments must be disabled even after failures');
assert.doesNotMatch(workflow, /deploy-production\s+"?--sha=/, 'Workflow must not use the broken gitSource deployment path');
assert.doesNotMatch(workflow, /github-limited/, 'Workflow must not depend on Vercel Git credentials');

console.log('Vercel prebuilt production workflow: contract passed.');
