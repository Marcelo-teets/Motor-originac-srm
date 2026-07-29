import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const files = await Promise.all([
  read('frontend/src/App.tsx'),
  read('frontend/src/components/Layout.tsx'),
  read('frontend/src/components/UI.tsx'),
  read('frontend/src/lib/api.ts'),
  read('frontend/src/lib/auth.tsx'),
  read('frontend/src/lib/companyDecisionReadinessApi.ts'),
  read('frontend/src/pages/CompaniesPage.tsx'),
  read('frontend/src/pages/PipelinePage.tsx'),
  read('frontend/src/pages/SearchProfilesPage.tsx'),
  read('frontend/src/main.tsx'),
  read('frontend/src/config/nav.ts'),
]);

const [app, layout, ui, api, auth, readiness, companies, pipeline, searchProfiles, main, nav] = files;

test('frontend uses route isolation, lazy modules and an explicit 404', () => {
  assert.match(app, /AppErrorBoundary/);
  assert.match(app, /Suspense/);
  assert.match(app, /lazy\(\(\) => import/);
  assert.match(app, /<NotFoundPage\s*\/>/);
  assert.doesNotMatch(app, /path="\*"[^\n]+Navigate to="\/"/);
});

test('navigation is derived from the canonical catalog and exposes the task center', () => {
  assert.match(nav, /to: '\/task-center'/);
  assert.match(layout, /item\.group !== 'Operação & governança'/);
  assert.match(layout, /item\.group === 'Operação & governança'/);
  assert.doesNotMatch(layout, /const intelligencePaths/);
  assert.doesNotMatch(layout, /const operationsPaths/);
});

test('critical frontend requests are bounded and readiness calls are deduplicated', () => {
  assert.match(api, /fetchWithPolicy/);
  assert.match(api, /timeoutMs: 25_000/);
  assert.match(readiness, /CACHE_TTL_MS/);
  assert.match(readiness, /inflight/);
});

test('lead list avoids the company-detail N+1 request pattern', () => {
  assert.doesNotMatch(companies, /api\.getCompany\(/);
  assert.match(companies, /Promise\.allSettled\(\[api\.getAbmWeekly/);
});

test('session renewal preserves token rotation and synchronizes browser contexts', () => {
  assert.match(auth, /refreshIfNeeded/);
  assert.match(auth, /refresh_token: refreshed\.refresh_token \?\? current\.refresh_token/);
  assert.match(auth, /visibilitychange/);
  assert.match(auth, /addEventListener\('storage'/);
});

test('core workflows expose retry, progress and non-duplicating writes', () => {
  assert.match(pipeline, /aria-pressed=\{view === 'board'\}/);
  assert.match(pipeline, /movingCompanyId !== null/);
  assert.match(searchProfiles, /promotingId/);
  assert.match(searchProfiles, /runningProfileId/);
  assert.match(searchProfiles, /<ErrorState/);
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-live="assertive"/);
  assert.match(main, /hardening\.css/);
});
