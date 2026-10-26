import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mayReferFidcToIdentity, validateFidcReviewDraft } from '../frontend/src/lib/fidcReviewSubmission.ts';

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
  read('backend/src/lib/discoverySourceCatalog.ts'),
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
  discoverySourceCatalog,
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

test('quick actions never fabricate operational decisions when the backend is unavailable', () => {
  assert.doesNotMatch(api, /qa_mock_/);
  assert.doesNotMatch(api, /Quick actions usando fallback sintético/);
  assert.doesNotMatch(api, /source:\s*'mock'[\s\S]{0,260}Quick actions/);
  assert.match(api, /ausência de dados não é preenchida por mocks/);
});

test('lead list avoids the company-detail N+1 request pattern', () => {
  assert.doesNotMatch(companies, /api\.getCompany\(/);
  assert.match(companies, /Promise\.allSettled\(\[api\.getAbmWeekly/);
});

test('session renewal uses the first-party Neon cookie and synchronizes browser contexts without persisting credentials', () => {
  assert.match(auth, /refreshIfNeeded/);
  assert.match(auth, /return neonAuth\.refreshSession\(\)/);
  assert.match(auth, /motor\.neon\.session/);
  assert.match(auth, /motor\.supabase\.session/);
  assert.match(auth, /motor\.auth\.signal/);
  assert.doesNotMatch(auth, /refresh_token: refreshed\.refresh_token/);
  assert.doesNotMatch(auth, /JSON\.stringify\(session\)/);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^\n]*motor\.neon\.session/);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^\n]*motor\.supabase\.session/);
  assert.match(auth, /authEpochRef = useRef\(0\)/);
  assert.match(auth, /authEpochRef\.current \+= 1/);
  assert.match(auth, /authEpochRef\.current !== expectedEpoch/);
  assert.match(auth, /await api\.logout\(nextSession\)\.catch\(\(\) => undefined\)/);
  assert.match(auth, /STALE_SESSION_KEYS\.includes\(event\.key\)/);
  assert.match(auth, /removeStaleSessions\(\)/);
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
  assert.match(quickSearch, /Consultando catálogo, web e universo observado/);
  assert.doesNotMatch(quickSearch, /if \(loading\) return <LoadingState/);
  assert.match(quickSearch, /já mapeada/);
  assert.match(quickSearch, /Company Master/);
  assert.match(quickSearch, /currentSearchSourceRef/);
  assert.match(quickSearch, /to="\/capture-inbox"/);
  assert.match(main, /quick-search\.css/);
  assert.match(nav, /Descreva o que procura/);
});

test('quick-search uses source catalog, persisted universe and parallel discovery without removing human review', () => {
  assert.match(discoveryCapture, /profile\.profilePayload\?\.userQuery/);
  assert.match(discoveryCapture, /buildDiscoveryQueries/);
  assert.match(discoveryCapture, /buildCatalogSourceLanes/);
  assert.match(discoveryCapture, /MAX_DISCOVERY_RESULTS = 80/);
  assert.match(discoveryCapture, /site:\$\{source\.domain\}/);
  assert.match(discoveryCapture, /persistedUniverseHits/);
  assert.match(discoveryCapture, /persisted-universe/);
  assert.match(discoveryCapture, /loadDiscoveryCatalogContext/);
  assert.match(discoveryCapture, /Promise\.allSettled/);
  assert.match(discoveryCapture, /corroboratingSources/);
  assert.match(discoveryCapture, /quickSearchNeedsPortfolioUniverse/);
  assert.match(discoveryCapture, /genericThemePrefix/);
  assert.match(discoveryCapture, /conclui\|concluiu/);

  assert.match(discoverySourceCatalog, /source_catalog/);
  assert.match(discoverySourceCatalog, /discovered_company_candidates/);
  assert.match(discoverySourceCatalog, /provider === 'google-news-rss'/);
  assert.match(discoverySourceCatalog, /health === 'healthy'/);
  assert.match(discoverySourceCatalog, /capital_market_event:/);

  assert.match(searchProfileCaptureService, /sourceCount: fulfilledLanes/);
  assert.match(searchProfileCaptureService, /visibleCandidates/);
  assert.match(searchProfileCaptureService, /isNewCandidate: false/);
  assert.match(searchProfileCaptureService, /matchState: candidate\.companyId \? 'company_master' : 'existing_candidate'/);
  assert.match(searchProfileCaptureService, /newCandidates: insertedCandidates\.length/);
  assert.match(searchProfileCaptureService, /assertCandidatePromotionReady/);
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

test('FIDC human review UI is restricted to actual god_mode and unavailable until audited backend releases', async () => {
  const [page, component] = await Promise.all([
    read('frontend/src/pages/CandidateDecisionQueuePage.tsx'),
    read('frontend/src/components/FidcHumanReviewPanel.tsx'),
  ]);
  assert.match(page, /FidcHumanReviewPanel headers=\{headers\} isGodMode=\{isGodMode\} reviewRequest=\{reviewRequest\}/);
  assert.match(component, /if \(!isGodMode\)/);
  assert.match(component, /status === 'unavailable'/);
  assert.match(component, /reviewError.*statusCode.*404/);
  assert.match(component, /status !== 'ready' \|\| saving/);
  assert.match(component, /method: 'POST'/);
  assert.match(component, /data\?\.reviewRecorded !== true/);
  assert.match(component, /read-after-write/i);
  assert.match(component, /NÃO foi promovida/);
  assert.doesNotMatch(component, /localStorage|autoPromote|setItem\(/);
});

test('FIDC human review refuses claims of identity referral without active operating registry', () => {
  const source = {
    cnpj: '12345678000190',
    legal_name: 'Originação Exemplo',
    review_lane: 'business_model_due_diligence',
    registration_status: 'ATIVA',
    cvm_evidence_url: 'https://dados.cvm.gov.br/fidc',
    registry_url: null,
    recommended_review_action: 'Confirmar recebíveis',
  };
  const draft = {
    disposition: 'refer_to_identity_review',
    rationale: 'Foi constatado apenas um vínculo CVM: verificar todas as alegações antes da promoção.',
    nextAction: 'Encaminhar o dossiê para revisão de identidade.',
    acknowledged: true,
  };
  assert.equal(mayReferFidcToIdentity(source), true);
  assert.equal(validateFidcReviewDraft(source, draft), null);
  assert.match(validateFidcReviewDraft({ ...source, registration_status: 'INAPTA' }, draft), /exige empresa operacional/);
  assert.match(validateFidcReviewDraft({ ...source, review_lane: 'regulated_entity_review' }, draft), /exige empresa operacional/);
  assert.match(validateFidcReviewDraft({ ...source, cvm_evidence_url: null }, draft), /fonte CVM verificável/);
  assert.match(validateFidcReviewDraft(source, { ...draft, acknowledged: false }), /Confirme/);
  assert.match(validateFidcReviewDraft(source, { ...draft, rationale: 'FIDC' }), /30 e 3.000/);
  assert.match(validateFidcReviewDraft(source, { ...draft, nextAction: 'Ver' }), /10 e 1.000/);
});

test('FIDC human review submits only source id, disposition, rationale and next action', async () => {
  const component = await read('frontend/src/components/FidcHumanReviewPanel.tsx');
  assert.match(component, /cnpj: selected\.cnpj, disposition,/);
  assert.match(component, /rationale: rationale\.trim\(\), nextAction: nextAction\.trim\(\)/);
  assert.doesNotMatch(component, /reviewerUserId:|reviewerEmail:|decisionEligible:|creditApproved:/);
});

test('FIDC rows open the authenticated review form without promoting companies', async () => {
  const [page, panel] = await Promise.all([
    read('frontend/src/pages/CandidateDecisionQueuePage.tsx'),
    read('frontend/src/components/FidcHumanReviewPanel.tsx'),
  ]);
  assert.match(page, /canReview=\{isGodMode\}/);
  assert.match(page, /onReviewCnpj=\{openFidcReview\}/);
  assert.match(page, /if \(!isGodMode\) return;/);
  assert.match(page, /setReviewRequest\(\(current\) => \(\{ cnpj, version: \(current\?\.version \?\? 0\) \+ 1 \}\)\)/);
  assert.match(page, /onClick=\{\(\) => onReviewCnpj\(item\.cnpj\)\}/);
  assert.match(page, /fidc-human-review-workspace/);
  assert.match(panel, /if \(!isGodMode \|\| status !== 'ready' \|\| !reviewRequest\) return;/);
  assert.match(panel, /sources\.some\(\(source\) => source\.cnpj === reviewRequest\.cnpj\)/);
  assert.match(panel, /changeSelected\(reviewRequest\.cnpj\)/);
  assert.match(panel, /reviewRequest\?\.version/);
  assert.doesNotMatch(page, /onClick=.*(?:creditApproved|autoPromote|createCompany)/);
});


test('Capture Inbox starts with actionable identity diligence, not an issuer-only queue', async () => {
  const [inbox, review] = await Promise.all([
    read('frontend/src/pages/CandidateDecisionQueuePage.tsx'),
    read('frontend/src/pages/CandidateIdentityReviewPage.tsx'),
  ]);
  assert.match(inbox, /useState<QueueType>\('identity'\)/);
  assert.match(inbox, /prioridade de triagem \{item\.priorityScore\}/);
  assert.match(inbox, /\/identity-review\?candidateId=\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(review, /const requestedCandidateId = searchParams\.get\('candidateId'\)/);
  assert.match(review, /consumedDeepLink\.current = requestedCandidateId;/);
  assert.match(review, /selectCandidate\(candidate\);/);
  assert.match(review, /consumedDeepLink\.current === requestedCandidateId/);
  assert.match(review, /if \(!candidate\) return;/);
  assert.doesNotMatch(inbox, /useState<QueueType>\('commercial'\)/);
});

test('credit review UI keeps unassessed facts distinct from explicit no/zero', async () => {
  const form = await read('frontend/src/pages/CompanyCreditReviewPage.tsx');
  for (const field of [
    'hasCreditProduct', 'creditIsCore', 'hasReceivables', 'receivablesStructurable',
    'hasFidc', 'usesStructuredDebt', 'fitFidc', 'fitDcm',
    'structuralScore', 'capitalScore', 'receivablesScore',
    'executionScore', 'timingScore', 'confidence',
  ]) {
    assert.match(form, new RegExp(field + ': null,'));
    assert.match(form, new RegExp(field + ': asOptional(?:Boolean|Number)\\(payload\\.' + field + '\\)'));
  }
  assert.match(form, /<option value="">Não avaliado<\/option>/);
  assert.match(form, /unreviewedFields\.length > 0/);
  assert.match(form, /value=\{form\[field\] \?\? ''\}/);
});
