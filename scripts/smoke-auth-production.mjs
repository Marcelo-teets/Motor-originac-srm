import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const AUTH_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];

const BUNDLE_MARKERS = [
  'captcha_token',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/v1/settings',
  'github',
  'google',
  'god_mode',
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
  requireCaptchaSiteKey = true,
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
  if (expectedSha) {
    assert.ok(
      shaMatches(healthSha, expectedSha),
      `Production backend SHA ${healthSha ?? 'missing'} does not match expected SHA ${expectedSha}`,
    );
  }
  checks.push({ check: 'backend-health', status: 'passed', detail: healthSha ?? 'sha unavailable' });

  const metadataResponse = await fetchWithRetry(`${normalizedBaseUrl}/build-meta.json`, {}, fetchImpl);
  const metadata = await readJson(metadataResponse, 'Frontend build metadata');
  assert.equal(metadata?.schemaVersion, 1, 'Unsupported frontend build metadata schema');
  assert.ok(metadata?.commitSha && metadata.commitSha !== 'local', 'Frontend build metadata has no deployment SHA');
  if (expectedSha) {
    assert.ok(
      shaMatches(metadata.commitSha, expectedSha),
      `Frontend SHA ${metadata.commitSha} does not match expected SHA ${expectedSha}`,
    );
  }
  assert.ok(
    shaMatches(metadata.commitSha, healthSha),
    `Frontend SHA ${metadata.commitSha} and backend SHA ${healthSha ?? 'missing'} are inconsistent`,
  );
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

  assert.equal(metadata?.auth?.captcha?.enabled, true, 'CAPTCHA must be enabled in production');
  assert.equal(metadata?.auth?.captcha?.tokenTransport, 'captcha_token', 'CAPTCHA token transport is incorrect');
  assert.ok(
    ['turnstile', 'hcaptcha'].includes(metadata?.auth?.captcha?.provider),
    `Unsupported CAPTCHA provider: ${metadata?.auth?.captcha?.provider ?? 'missing'}`,
  );
  if (requireCaptchaSiteKey) {
    assert.equal(
      metadata?.auth?.captcha?.siteKeyConfigured,
      true,
      'VITE_CAPTCHA_SITE_KEY is not configured in the production frontend build',
    );
  }
  checks.push({
    check: 'captcha-config',
    status: 'passed',
    detail: `${metadata.auth.captcha.provider}; siteKey=${metadata.auth.captcha.siteKeyConfigured}`,
  });

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

  for (const marker of BUNDLE_MARKERS) {
    assert.ok(bundle.includes(marker), `Production bundle is missing Auth marker: ${marker}`);
  }
  checks.push({ check: 'auth-bundle-markers', status: 'passed', detail: BUNDLE_MARKERS.join(', ') });

  assert.equal(metadata?.auth?.oauthProviderDiscovery, true, 'OAuth provider discovery is not declared in this build');
  assert.ok(
    metadata?.auth?.supportedOAuthProviders?.includes('github'),
    'GitHub OAuth support is not declared in this build',
  );
  assert.ok(
    metadata?.auth?.supportedOAuthProviders?.includes('google'),
    'Google OAuth support is not declared in this build',
  );
  assert.equal(metadata?.auth?.godModeIncluded, true, 'GOD-MODE support is not declared in this build');
  checks.push({
    check: 'oauth-and-god-mode',
    status: 'passed',
    detail: 'dynamic provider discovery; github/google supported; GOD-MODE declared',
  });

  return {
    status: 'passed',
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
    requireCaptchaSiteKey: process.env.REQUIRE_CAPTCHA_SITE_KEY !== 'false',
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
