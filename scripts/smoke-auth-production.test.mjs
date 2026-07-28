import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runAuthProductionSmoke } from './smoke-auth-production.mjs';

const sha = '1234567890abcdef1234567890abcdef12345678';
const publishableKey = 'sb_publishable_test_public_key';
const appShell = '<!doctype html><html><head><script type="module" src="/assets/index-test.js"></script></head><body><div id="root"></div></body></html>';
const requiredBundleMarkers = [
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/v1/settings',
  'github',
  'google',
  'god_mode',
].join(';');

const buildMetadata = () => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha: sha,
  branch: 'main',
  environment: 'production',
  auth: {
    mode: 'email_password_and_oauth',
    emailPasswordConfigured: true,
    oauthFallbackSupported: true,
    publicClient: {
      projectRef: 'hdghpmssudrqhsbvrdyt',
      supabaseUrlConfigured: true,
      publishableKeyConfigured: true,
      source: 'canonical_public_config',
    },
    routes: [
      '/login',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/profile',
      '/change-password',
      '/users',
    ],
    captchaEnabled: false,
    oauthProviderDiscovery: true,
    supportedOAuthProviders: ['github', 'google'],
    godModeIncluded: true,
  },
});

const startServer = async ({ bundle, metadata = buildMetadata() } = {}) => {
  const server = createServer((request, response) => {
    const path = request.url?.split('?')[0];
    const origin = `http://${request.headers.host}`;

    if (path === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'real',
        data: {
          mode: 'real',
          build: { gitSha: sha },
        },
      }));
      return;
    }

    if (path === '/build-meta.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(metadata));
      return;
    }

    if (path === '/assets/index-test.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end(bundle ?? `${requiredBundleMarkers};${origin};${publishableKey}`);
      return;
    }

    if (path === '/auth/v1/settings') {
      if (request.headers.apikey !== publishableKey) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'invalid api key' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ external: { github: true, google: true } }));
      return;
    }

    if (['/login', '/forgot-password', '/reset-password', '/auth/callback'].includes(path ?? '')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(appShell);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

const runSmoke = ({ baseUrl, ...options }) => runAuthProductionSmoke({
  baseUrl,
  expectedSha: sha,
  expectedSupabaseUrl: baseUrl,
  expectedSupabasePublishableKey: publishableKey,
  ...options,
});

test('production Auth smoke validates real public client configuration', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const report = await runSmoke({ baseUrl });
    assert.equal(report.status, 'passed');
    assert.equal(report.authMode, 'email_password_and_oauth');
    assert.equal(report.deployedSha, sha);
    assert.equal(report.checks.find(({ check }) => check === 'public-auth-config')?.status, 'passed');
    assert.equal(report.checks.find(({ check }) => check === 'supabase-auth-settings')?.status, 'passed');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects a build that reports CAPTCHA enabled', async () => {
  const metadata = buildMetadata();
  metadata.auth.captchaEnabled = true;
  const { server, baseUrl } = await startServer({ metadata });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /CAPTCHA must be disabled/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects retired CAPTCHA markers in the bundle', async () => {
  const { server, baseUrl } = await startServer({
    bundle: `${requiredBundleMarkers};captcha_token;gotrue_meta_security`,
  });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /retired CAPTCHA marker/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects metadata that claims Auth without a configured public client', async () => {
  const metadata = buildMetadata();
  metadata.auth.publicClient.publishableKeyConfigured = false;
  const { server, baseUrl } = await startServer({ metadata });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /publishable key must be configured/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects a bundle that omits the canonical Supabase client values', async () => {
  const { server, baseUrl } = await startServer({ bundle: requiredBundleMarkers });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /canonical Supabase URL/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
