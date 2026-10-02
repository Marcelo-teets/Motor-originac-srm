import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const canonicalPublicAuthConfig = JSON.parse(readFileSync(
  new URL('../frontend/public-auth.config.json', import.meta.url),
  'utf8',
));

const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];
const REQUIRED_NEON_PATHS = [
  '/sign-in/email',
  '/get-session',
  '/token',
  '/sign-out',
  '/request-password-reset',
  '/reset-password',
];
const REQUIRED_BUNDLE_MARKERS = ['/auth/session', '/auth/register', 'god_mode'];
const FORBIDDEN_BUNDLE_MARKERS = [
  '/auth/v1/token',
  '/auth/v1/user',
  '/auth/v1/settings',
  'gotrue_meta_security',
  'captcha_token',
  'CaptchaChallenge',
  'VITE_CAPTCHA_',
  'VITE_TURNSTILE_SITE_KEY',
  'VITE_HCAPTCHA_SITE_KEY',
];

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchWithRetry = async (url, options = {}, fetchImpl = fetch) => {
  const attempts = Number(options.attempts ?? 3);
  const retryDelayMs = Number(options.retryDelayMs ?? 750);
  const requestTimeoutMs = Number(options.requestTimeoutMs ?? 8_000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: options.method ?? 'GET',
        body: options.body,
        redirect: 'follow',
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          'cache-control': 'no-cache',
          ...(options.headers ?? {}),
        },
      });

      if (response.ok || options.acceptStatus?.includes(response.status)) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) await delay(retryDelayMs);
  }

  throw lastError ?? new Error(`Unable to fetch ${url}`);
};

const extractModuleAssets = (html, baseUrl) => {
  const assets = [];
  const expression = /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi;
  let match;
  while ((match = expression.exec(html)) !== null) assets.push(new URL(match[1], baseUrl).toString());
  return [...new Set(assets)];
};

const readJson = async (response, label) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return valid JSON: ${text.slice(0, 300)}`);
  }
};

const resolveHealthSha = (health) => (
  health?.data?.build?.gitSha
  || health?.build?.gitSha
  || health?.gitSha
  || null
);

const shaMatches = (actual, expected) => (
  typeof actual === 'string'
  && typeof expected === 'string'
  && (actual === expected || actual.startsWith(expected) || expected.startsWith(actual))
);

export const runAuthProductionSmoke = async ({
  baseUrl,
  expectedSha,
  expectedNeonAuthBaseUrl = canonicalPublicAuthConfig.neonAuthBaseUrl,
  fetchImpl = fetch,
} = {}) => {
  assert.ok(baseUrl, 'baseUrl is required');
  assert.ok(expectedNeonAuthBaseUrl, 'expectedNeonAuthBaseUrl is required');

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedNeonAuthBaseUrl = normalizeBaseUrl(expectedNeonAuthBaseUrl);
  const checks = [];

  const healthResponse = await fetchWithRetry(`${normalizedBaseUrl}/api/health`, {}, fetchImpl);
  const health = await readJson(healthResponse, 'Health endpoint');
  const healthSha = resolveHealthSha(health);
  assert.equal(health?.status, 'real', 'Backend health must report status=real');
  assert.equal(health?.data?.mode, 'real', 'Backend health must report mode=real');
  assert.equal(health?.data?.dataProvider, 'neon', 'Backend data provider must be Neon');
  if (expectedSha) assert.ok(shaMatches(healthSha, expectedSha), `Production backend SHA ${healthSha ?? 'missing'} does not match expected SHA ${expectedSha}`);
  checks.push({ check: 'backend-health', status: 'passed', detail: `provider=neon; sha=${healthSha ?? 'unavailable'}` });

  const metadataResponse = await fetchWithRetry(`${normalizedBaseUrl}/build-meta.json`, {}, fetchImpl);
  const metadata = await readJson(metadataResponse, 'Frontend build metadata');
  assert.equal(metadata?.schemaVersion, 1, 'Unsupported frontend build metadata schema');
  assert.ok(metadata?.commitSha && metadata.commitSha !== 'local', 'Frontend build metadata has no deployment SHA');
  if (expectedSha) assert.ok(shaMatches(metadata.commitSha, expectedSha), `Frontend SHA ${metadata.commitSha} does not match expected SHA ${expectedSha}`);
  assert.ok(shaMatches(metadata.commitSha, healthSha), `Frontend SHA ${metadata.commitSha} and backend SHA ${healthSha ?? 'missing'} are inconsistent`);
  checks.push({ check: 'frontend-backend-sha', status: 'passed', detail: metadata.commitSha });

  assert.equal(metadata?.auth?.provider, 'neon', 'Canonical Auth provider must be Neon');
  assert.equal(metadata?.auth?.mode, 'email_password', 'Auth mode must be Neon email/password');
  assert.equal(metadata?.auth?.emailPasswordConfigured, true, 'Email/password must be available');
  assert.equal(metadata?.auth?.registrationRequiresApproval, true, 'New registrations must require approval');
  assert.equal(metadata?.auth?.oauthProviderDiscovery, false, 'OAuth must remain hidden until first-party callback cutover');
  assert.deepEqual(metadata?.auth?.supportedOAuthProviders, [], 'No OAuth provider should be exposed during the cutover');
  assert.equal(metadata?.auth?.captchaEnabled, false, 'CAPTCHA must remain disabled');
  assert.equal(metadata?.auth?.privilegedBootstrapDefault, false, 'Privileged bootstrap must default to disabled');
  assert.equal(metadata?.auth?.sessionTransport, 'first_party_httponly_cookie_plus_short_lived_jwt');
  assert.equal(metadata?.auth?.godModeIncluded, true, 'GOD-MODE support must remain available through RBAC');
  checks.push({ check: 'auth-build-contract', status: 'passed', detail: 'neon; approval-required; first-party cookie + JWT' });

  for (const route of AUTH_ROUTES) {
    assert.ok(metadata?.auth?.routes?.includes(route), `Build metadata does not declare Auth route ${route}`);
    const response = await fetchWithRetry(`${normalizedBaseUrl}${route}`, {}, fetchImpl);
    const contentType = response.headers.get('content-type') ?? '';
    const html = await response.text();
    assert.match(contentType, /text\/html/i, `${route} did not return HTML`);
    assert.match(html, /<div[^>]+id=["']root["']/i, `${route} did not return the React application shell`);
  }
  checks.push({ check: 'auth-routes', status: 'passed', detail: AUTH_ROUTES.join(', ') });

  const bootstrapResponse = await fetchWithRetry(`${normalizedBaseUrl}/api/auth/bootstrap-status`, {}, fetchImpl);
  const bootstrap = await readJson(bootstrapResponse, 'Auth bootstrap status');
  assert.equal(bootstrap?.data?.provider, 'neon', 'Bootstrap endpoint must report Neon');
  assert.equal(bootstrap?.data?.enabled, false, 'Privileged bootstrap must be disabled in production');
  assert.equal(bootstrap?.data?.available, false, 'Privileged bootstrap must not be available in production');
  checks.push({ check: 'privileged-bootstrap', status: 'passed', detail: 'disabled' });

  const openApiResponse = await fetchWithRetry(
    `${normalizedNeonAuthBaseUrl}/open-api/generate-schema`,
    {},
    fetchImpl,
  );
  const openApi = await readJson(openApiResponse, 'Neon Auth OpenAPI');
  for (const path of REQUIRED_NEON_PATHS) {
    assert.ok(openApi?.paths?.[path], `Neon Auth OpenAPI is missing ${path}`);
  }
  checks.push({ check: 'neon-auth-openapi', status: 'passed', detail: REQUIRED_NEON_PATHS.join(', ') });

  const loginResponse = await fetchWithRetry(`${normalizedBaseUrl}/login`, {}, fetchImpl);
  const loginHtml = await loginResponse.text();
  const assetUrls = extractModuleAssets(loginHtml, normalizedBaseUrl);
  assert.ok(assetUrls.length > 0, 'No JavaScript module asset was found in the login page');

  const bundleParts = [];
  for (const assetUrl of assetUrls) {
    const assetResponse = await fetchWithRetry(assetUrl, {}, fetchImpl);
    bundleParts.push(await assetResponse.text());
  }
  const bundle = bundleParts.join('\n');
  for (const marker of REQUIRED_BUNDLE_MARKERS) {
    assert.ok(bundle.includes(marker), `Production bundle is missing Auth marker: ${marker}`);
  }
  for (const marker of FORBIDDEN_BUNDLE_MARKERS) {
    assert.equal(bundle.includes(marker), false, `Production bundle still contains retired Auth marker: ${marker}`);
  }
  checks.push({ check: 'auth-bundle-boundary', status: 'passed', detail: 'first-party proxy markers present; direct Supabase Auth markers absent' });

  return {
    status: 'passed',
    authMode: metadata.auth.mode,
    authProvider: metadata.auth.provider,
    baseUrl: normalizedBaseUrl,
    expectedSha: expectedSha ?? null,
    deployedSha: metadata.commitSha,
    deploymentEnvironment: metadata.environment,
    neonProjectId: canonicalPublicAuthConfig.neonProjectId,
    checks,
  };
};

const appendSummary = (report) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = report.checks
    .map(({ check, status, detail }) => `| ${check} | ${status} | ${String(detail).replaceAll('|', '\\|')} |`)
    .join('\n');

  appendFileSync(summaryPath, [
    '# Production Auth Smoke',
    '',
    `- Result: **${report.status}**`,
    `- Auth provider: **${report.authProvider}**`,
    `- Auth mode: **${report.authMode}**`,
    `- URL: ${report.baseUrl}`,
    `- Neon project: \`${report.neonProjectId}\``,
    `- Deployed SHA: \`${report.deployedSha}\``,
    `- Expected SHA: \`${report.expectedSha ?? 'not provided'}\``,
    '',
    '| Check | Status | Detail |',
    '|---|---|---|',
    rows,
    '',
  ].join('\n'));
};

const main = async () => {
  const report = await runAuthProductionSmoke({
    baseUrl: process.env.BASE_URL || 'https://motor-originac-srm.vercel.app',
    expectedSha: process.env.EXPECTED_SHA || undefined,
    expectedNeonAuthBaseUrl: process.env.EXPECTED_NEON_AUTH_BASE_URL || canonicalPublicAuthConfig.neonAuthBaseUrl,
  });
  console.log(JSON.stringify(report, null, 2));
  appendSummary(report);
};

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
