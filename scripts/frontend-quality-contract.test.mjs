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
  read('frontend/src/pages/QuickSearchPage.tsx'),
  read('frontend/src/pages/TaskCenterWithAiPage.tsx'),
  read('frontend/src/pages/TaskCenterPage.tsx'),
  read('frontend/src/components/TaskAiComposer.tsx'),
  read('frontend/src/main.tsx'),
  read('frontend/src/config/nav.ts'),
  read('backend/src/lib/discoveryCapture.ts'),
  read('backend/src/services/searchProfileCaptureService.ts'),
]);

const [
  app,
  layout,
  ui,
  api,
  auth,
  readiness,
  companies,
  pipeline,
  searchProfiles,
  quickSearch,
  taskCenterWorkspace,
  taskCenter,
  taskAiComposer,
  main,
  nav,
  discoveryCapture,
  searchProfileCaptureService,
] = files;

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

test('sidebar disclosures snapshot the DOM state before scheduling React updates', () => {
  assert.match(layout, /const isOpen = event\.currentTarget\.open;/);
  assert.match(layout, /syncDisclosureState\('intelligence', isOpen\)/);
  assert.match(layout, /syncDisclosureState\('operations', isOpen\)/);
  assert.doesNotMatch(
    layout,
    /setExpandedGroups\(\(current\)[\s\S]{0,180}event\.currentTarget\.open/,
  );
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
  assert.match(searchProfiles, /runningProfileId/);
  assert.match(searchProfiles, /crypto\.randomUUID\(\)/);
  assert.match(searchProfiles, /<ErrorState/);
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-live="assertive"/);
  assert.match(main, /hardening\.css/);
});

test('search defaults to one-step natural-language discovery and keeps advanced mode available', () => {
  assert.match(app, /path="search-profiles" element=\{<QuickSearchPage \/>\}/);
  assert.match(app, /path="search-profiles\/advanced" element=\{<SearchProfilesPage \/>\}/);
  assert.match(quickSearch, /O que você quer encontrar\?/);
  assert.match(quickSearch, /Buscar empresas/);
  assert.match(quickSearch, /mode: 'quick-search'/);
  assert.match(quickSearch, /useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(quickSearch, /activeProfileIdRef\.current = crypto\.randomUUID\(\)/);
  assert.match(quickSearch, /candidatesFound/);
  assert.match(quickSearch, /candidatesInserted/);
  assert.match(quickSearch, /sourceCount/);
  assert.match(quickSearch, /Consultando fontes em paralelo/);
  assert.doesNotMatch(quickSearch, /if \(loading\) return <LoadingState/);
  assert.match(quickSearch, /Nenhuma candidata nova/);
  assert.match(quickSearch, /to="\/capture-inbox"/);
  assert.match(main, /quick-search\.css/);
  assert.match(nav, /Descreva o que procura/);
});

test('quick-search fans out discovery for recall without removing human review', () => {
  assert.match(discoveryCapture, /profile\.profilePayload\?\.userQuery/);
  assert.match(discoveryCapture, /buildDiscoveryQueries/);
  assert.match(discoveryCapture, /MAX_DISCOVERY_RESULTS = 60/);
  assert.match(discoveryCapture, /runNewsDiscoveryLane/);
  assert.match(discoveryCapture, /Promise\.allSettled/);
  assert.match(discoveryCapture, /discoveryLane/);
  assert.match(discoveryCapture, /corroboratedDiscoveryHits/);
  assert.match(discoveryCapture, /quickSearchNeedsPortfolioUniverse/);
  assert.match(discoveryCapture, /genericThemePrefix/);
  assert.match(discoveryCapture, /conclui\|concluiu/);
  assert.match(searchProfileCaptureService, /sourceCount: fulfilledLanes/);
  assert.match(searchProfileCaptureService, /discovery\.hits/);
});

test('Today dashboard remains visible even when the decision gate is closed', () => {
  assert.match(app, /<Route index element=\{<DashboardPage \/>\} \/>/);
  assert.doesNotMatch(app, /<Route index element=\{portfolioGate\(<DashboardPage \/>\)\} \/>/);
  assert.match(app, /path="companies" element=\{portfolioGate\(<CompaniesPage \/>\)\}/);
  assert.match(app, /path="pipeline" element=\{portfolioGate\(<PipelinePage \/>\)\}/);
});

test('task center is a single execution workspace with guarded Microsoft actions', () => {
  assert.match(taskCenterWorkspace, /role="tablist"/);
  assert.match(taskCenterWorkspace, /<TaskCenterPage embedded \/>/);
  assert.match(taskCenterWorkspace, /<TaskAiComposer embedded \/>/);
  assert.match(taskCenter, /confirmDisconnect/);
  assert.match(taskCenter, /query\.delete\('microsoft'\)/);
  assert.match(taskCenter, /aria-pressed=\{taskFilter === value\}/);
  assert.match(taskCenter, /if \(busyAction\) return/);
});

test('AI task plans remain editable and require explicit human creation', () => {
  assert.match(taskAiComposer, /updateTask/);
  assert.match(taskAiComposer, /removeTask/);
  assert.match(taskAiComposer, /Aprovar e criar pendentes/);
  assert.match(taskAiComposer, /approvalRequired/);
  assert.match(taskAiComposer, /createdIds\.includes/);
  assert.match(main, /task-center-v2\.css/);
});
