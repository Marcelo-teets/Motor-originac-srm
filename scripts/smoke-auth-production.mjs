import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const AUTH_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];

const REQUIRED_BUNDLE_MARKERS = [
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/v1/settings',
  'github',
  'google',
  'god_mode',
];

const FORBIDDEN_BUNDLE_MARKERS = [
  'gotrue_meta_security',
  'captcha_token',
  'CaptchaChallenge',
  'VITE_CAPTCHA_',
  'VITE_TURNSTILE_SITE_KEY',
  'VITE_HCAPTCHA_SITE_KEY',
  'challenges.cloudflare.com/turnstile',
  'js.hcaptcha.com',
];

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchWithRetry = async (url, options = {}, fetchImpl = fetch) => {
  const attempts = Number(options.attempts ?? 5);
  const retryDelayMs = Number(options.retryDelayMs ?? 2_000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        headers: {
          'cache-control': 'no-cache',
          ...(options.headers ?? {}),
        },
      });

      if (response.ok) return response;
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

  while ((match = expression.exec(html)) !== null) {
    assets.push(new URL(match[1], baseUrl).toString());
  }

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
  fetchImpl = fetch,
} = {}) => {
  assert.ok(baseUrl, 'baseUrl is required');
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const checks = [];

  const healthResponse = await fetchWithRetry(`${normalizedBaseUrl}/api/health`, {}, fetchImpl);
  const health = await readJson(healthResponse, 'Health endpoint');
  const healthSha = resolveHealthSha(health);
  assert.equal(health?.status, 'real', 'Backend health must report status=real');
  assert.equal(health?.data?.mode, 'real', 'Backend health must report mode=real');
  if (expectedSha) assert.ok(shaMatches(healthSha, expectedSha), `Production backend SHA ${healthSha ?? 'missing'} does not match expected SHA ${expectedSha}`);
  checks.push({ check: 'backend-health', status: 'passed', detail: healthSha ?? 'sha unavailable' });

  const metadataResponse = await fetchWithRetry(`${normalizedBaseUrl}/build-meta.json`, {}, fetchImpl);
  const metadata = await readJson(metadataResponse, 'Frontend build metadata');
  assert.equal(metadata?.schemaVersion, 1, 'Unsupported frontend build metadata schema');
  assert.ok(metadata?.commitSha && metadata.commitSha !== 'local', 'Frontend build metadata has no deployment SHA');
  if (expectedSha) assert.ok(shaMatches(metadata.commitSha, expectedSha), `Frontend SHA ${metadata.commitSha} does not match expected SHA ${expectedSha}`);
  assert.ok(shaMatches(metadata.commitSha, healthSha), `Frontend SHA ${metadata.commitSha} and backend SHA ${healthSha ?? 'missing'} are inconsistent`);
  checks.push({ check: 'frontend-backend-sha', status: 'passed', detail: metadata.commitSha });

  for (const route of AUTH_ROUTES) {
    assert.ok(metadata?.auth?.routes?.includes(route), `Build metadata does not declare Auth route ${route}`);
    const response = await fetchWithRetry(`${normalizedBaseUrl}${route}`, {}, fetchImpl);
    const contentType = response.headers.get('content-type') ?? '';
    const html = await response.text();
    assert.match(contentType, /text\/html/i, `${route} did not return HTML`);
    assert.match(html, /<div[^>]+id=["']root["']/i, `${route} did not return the React application shell`);
    checks.push({ check: `route:${route}`, status: 'passed', detail: `HTTP ${response.status}` });
  }

  assert.equal(metadata?.auth?.mode, 'email_password_and_oauth', 'Auth mode must expose email/password and OAuth');
  assert.equal(metadata?.auth?.emailPasswordConfigured, true, 'Email/password must be available');
  assert.equal(metadata?.auth?.captchaEnabled, false, 'CAPTCHA must be disabled');
  assert.equal(metadata?.auth?.captcha, undefined, 'Legacy CAPTCHA metadata must not be emitted');
  checks.push({ check: 'captcha-removed', status: 'passed', detail: 'server and frontend contract require captchaEnabled=false' });

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
    assert.equal(bundle.includes(marker), false, `Production bundle still contains retired CAPTCHA marker: ${marker}`);
  }
  checks.push({ check: 'auth-bundle-markers', status: 'passed', detail: `required=${REQUIRED_BUNDLE_MARKERS.join(', ')}; captcha markers absent` });

  assert.equal(metadata?.auth?.oauthProviderDiscovery, true, 'OAuth provider discovery is not declared in this build');
  assert.ok(metadata?.auth?.supportedOAuthProviders?.includes('github'), 'GitHub OAuth support is not declared in this build');
  assert.ok(metadata?.auth?.supportedOAuthProviders?.includes('google'), 'Google OAuth support is not declared in this build');
  assert.equal(metadata?.auth?.godModeIncluded, true, 'GOD-MODE support is not declared in this build');
  checks.push({ check: 'oauth-and-god-mode', status: 'passed', detail: 'dynamic provider discovery; github/google supported; GOD-MODE declared' });

  return {
    status: 'passed',
    authMode: metadata.auth.mode,
    baseUrl: normalizedBaseUrl,
    expectedSha: expectedSha ?? null,
    deployedSha: metadata.commitSha,
    deploymentEnvironment: metadata.environment,
    generatedAt: new Date().toISOString(),
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
    `- Auth mode: **${report.authMode}**`,
    `- URL: ${report.baseUrl}`,
    `- Deployed SHA: \`${report.deployedSha}\``,
    `- Expected SHA: \`${report.expectedSha ?? 'not provided'}\``,
    `- Environment: \`${report.deploymentEnvironment}\``,
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
  });

  console.log(JSON.stringify(report, null, 2));
  appendSummary(report);
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
