import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const apiEntries = readdirSync('api')
  .filter((name) => name.endsWith('.ts'))
  .filter((name) => /export\s+default/.test(readFileSync(join('api', name), 'utf8')));

assert.ok(
  apiEntries.length <= 12,
  `Vercel Hobby supports at most 12 Serverless Functions; api/ declares ${apiEntries.length}: ${apiEntries.join(', ')}`,
);

const consolidatedRoutes = [
  'bounded-capture-run',
  'bounded-capture-targets',
  'candidate-identity-review',
  'company-credit-review',
  'company-decision-readiness',
  'fidc-market-map',
];

const dispatcher = readFileSync('api/index.ts', 'utf8');
for (const route of consolidatedRoutes) {
  assert.equal(existsSync(`api/${route}.ts`), false, `${route} must not create a standalone Vercel Function`);
  assert.equal(existsSync(`serverless/${route}.ts`), true, `${route} consolidated handler is missing`);
  assert.ok(dispatcher.includes(`/api/${route}`), `${route} route is missing from api/index.ts`);
  assert.ok(dispatcher.includes(`../serverless/${route}.js`), `${route} module is missing from api/index.ts`);
}

console.log(`Vercel function budget: ${apiEntries.length}/12 functions; consolidated routes=${consolidatedRoutes.length}.`);
