import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { runAuthProductionSmoke } from './smoke-auth-production.mjs';

const sha = '1234567890abcdef1234567890abcdef12345678';
const appShell = '<!doctype html><html><head><script type="module" src="/assets/index-test.js"></script></head><body><div id="root"></div></body></html>';
const requiredBundleMarkers = ['/auth/session', '/auth/register', 'god_mode'].join(';');

const buildMetadata = () => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha: sha,
  branch: 'main',
  environment: 'production',
  auth: {
    provider: 'neon',
    mode: 'email_password',
    emailPasswordConfigured: true,
    registrationRequiresApproval: true,
    oauthFallbackSupported: false,
    publicClient: {
      neonProjectId: 'steep-poetry-38942951',
      neonAuthUrlConfigured: true,
      source: 'canonical_public_config',
      legacySupabaseConfigured: true,
    },
    routes: ['/login', '/forgot-password', '/reset-password', '/auth/callback', '/profile', '/change-password', '/users'],
    captchaEnabled: false,
    oauthProviderDiscovery: false,
    supportedOAuthProviders: [],
    godModeIncluded: true,
    privilegedBootstrapDefault: false,
    sessionTransport: 'first_party_httponly_cookie_plus_short_lived_jwt',
  },
});

const openApi = {
  openapi: '3.1.0',
  paths: Object.fromEntries([
    '/sign-in/email',
    '/get-session',
    '/token',
    '/sign-out',
    '/request-password-reset',
    '/reset-password',
  ].map((path) => [path, { post: {} }])),
};

const startServer = async ({ bundle, metadata = buildMetadata(), bootstrapEnabled = false } = {}) => {
  const server = createServer((request, response) => {
    const path = request.url?.split('?')[0];

    if (path === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'real',
        data: {
          mode: 'real',
          dataProvider: 'neon',
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

    if (path === '/api/auth/bootstrap-status') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'real',
        data: { provider: 'neon', enabled: bootstrapEnabled, available: bootstrapEnabled },
      }));
      return;
    }

    if (path === '/neon-auth/open-api/generate-schema') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(openApi));
      return;
    }

    if (path === '/assets/index-test.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end(bundle ?? requiredBundleMarkers);
      return;
    }

    if (['/login', '/forgot-password', '/reset-password'].includes(path ?? '')) {
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

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const runSmoke = ({ baseUrl, ...options }) => runAuthProductionSmoke({
  baseUrl,
  expectedSha: sha,
  expectedNeonAuthBaseUrl: `${baseUrl}/neon-auth`,
  ...options,
});

test('production Auth smoke validates Neon provider, first-party boundary and OpenAPI', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const report = await runSmoke({ baseUrl });
    assert.equal(report.status, 'passed');
    assert.equal(report.authProvider, 'neon');
    assert.equal(report.authMode, 'email_password');
    assert.equal(report.deployedSha, sha);
    assert.equal(report.checks.find(({ check }) => check === 'neon-auth-openapi')?.status, 'passed');
    assert.equal(report.checks.find(({ check }) => check === 'auth-bundle-boundary')?.status, 'passed');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects production when privileged bootstrap is enabled', async () => {
  const { server, baseUrl } = await startServer({ bootstrapEnabled: true });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /bootstrap must be disabled/i);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects direct Supabase Auth markers in the frontend bundle', async () => {
  const { server, baseUrl } = await startServer({
    bundle: `${requiredBundleMarkers};/auth/v1/user`,
  });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /retired Auth marker/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects metadata that claims an OAuth provider during first-party cutover', async () => {
  const metadata = buildMetadata();
  metadata.auth.supportedOAuthProviders = ['google'];
  const { server, baseUrl } = await startServer({ metadata });
  try {
    await assert.rejects(runSmoke({ baseUrl }), /No OAuth provider should be exposed/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('rejects a backend that is not using Neon data provider', async () => {
  const { server, baseUrl } = await startServer();
  const fetchImpl = async (url, init) => {
    const response = await fetch(url, init);
    if (String(url).endsWith('/api/health')) {
      const payload = await response.json();
      payload.data.dataProvider = 'supabase';
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };
  try {
    await assert.rejects(runSmoke({ baseUrl, fetchImpl }), /data provider must be Neon/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
