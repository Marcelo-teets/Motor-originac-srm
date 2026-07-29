import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const apiEntries = readdirSync('api')
  .filter((name) => name.endsWith('.ts'))
  .filter((name) => !name.endsWith('.d.ts'));

assert.ok(
  apiEntries.length <= 12,
  `Vercel Hobby supports at most 12 Serverless Functions; api/ declares ${apiEntries.length}: ${apiEntries.join(', ')}`,
);

for (const name of apiEntries) {
  const source = readFileSync(join('api', name), 'utf8');
  assert.match(source, /export\s+default/, `${name} is inside api/ but does not export a Vercel handler. Move helpers to serverless/ or use a .d.ts declaration.`);
}

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
