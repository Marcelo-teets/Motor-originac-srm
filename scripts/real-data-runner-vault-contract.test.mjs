import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = {
  capture: new URL('../.github/workflows/capture.yml', import.meta.url),
  capital: new URL('../.github/workflows/capital-market-ingestion.yml', import.meta.url),
  discovery: new URL('../.github/workflows/search-profile-discovery.yml', import.meta.url),
};

const [capture, capital, discovery] = await Promise.all([
  readFile(paths.capture, 'utf8'),
  readFile(paths.capital, 'utf8'),
  readFile(paths.discovery, 'utf8'),
]);

for (const [name, source] of Object.entries({ capture, capital, discovery })) {
  test(`${name} loads the canonical Neon URL from the Vercel vault`, () => {
    assert.match(source, /bash scripts\/load-neon-from-vercel\.sh/);
    assert.match(source, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/);
    assert.match(source, /VERCEL_PROJECT_ID: prj_hsB473e7bNF0xOd6CEUwo7WFgNYs/);
    assert.doesNotMatch(source, /MOTOR_NEON_DATABASE_URL: \$\{\{ secrets\.MOTOR_NEON_DATABASE_URL \}\}/);
  });
}

test('production runner URLs use the canonical Vercel domain', () => {
  assert.match(capital, /https:\/\/motor-originac-srm\.vercel\.app\/api\/capital-markets\/run/);
  assert.match(discovery, /https:\/\/motor-originac-srm\.vercel\.app\/api\/search-profiles\/cron\/run/);
  assert.doesNotMatch(capital + discovery, /motor-originac-srm-marcelo-teets-projects\.vercel\.app/);
});

test('search discovery classifier job has a valid steps block under the job', () => {
  assert.match(discovery, /classify_news_candidates:[\s\S]*?env:[\s\S]*?VERCEL_PROJECT_NAME: motor-originac-srm\n\s{4}steps:/);
  assert.doesNotMatch(discovery, /^steps:/m);
});
