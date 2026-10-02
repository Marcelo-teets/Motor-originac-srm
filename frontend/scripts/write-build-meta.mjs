import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
const publicAuthConfig = JSON.parse(readFileSync(
  new URL('../public-auth.config.json', import.meta.url),
  'utf8',
));
const publicDir = join(process.cwd(), 'public');
const outputPath = join(publicDir, 'build-meta.json');

const commitSha = (
  env.VERCEL_GIT_COMMIT_SHA
  || env.GITHUB_SHA
  || env.COMMIT_SHA
  || 'local'
).trim();

const branch = (
  env.VERCEL_GIT_COMMIT_REF
  || env.GITHUB_REF_NAME
  || 'local'
).trim();

const deploymentEnvironment = (
  env.VERCEL_ENV
  || env.NODE_ENV
  || 'local'
).trim();

const resolvedNeonAuthUrl = (
  env.VITE_NEON_AUTH_URL
  || publicAuthConfig.neonAuthBaseUrl
  || ''
).trim();

const resolvedSupabaseUrl = (
  env.VITE_SUPABASE_URL
  || publicAuthConfig.supabaseUrl
  || ''
).trim();
const resolvedPublishableKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY
  || env.VITE_SUPABASE_ANON_KEY
  || publicAuthConfig.supabasePublishableKey
  || ''
).trim();

const neonAuthConfigured = Boolean(resolvedNeonAuthUrl);
const legacySupabaseConfigured = Boolean(resolvedSupabaseUrl && resolvedPublishableKey);

const metadata = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha,
  branch,
  environment: deploymentEnvironment,
  auth: {
    provider: 'neon',
    mode: neonAuthConfigured ? 'email_password' : 'misconfigured',
    emailPasswordConfigured: neonAuthConfigured,
    registrationRequiresApproval: true,
    oauthFallbackSupported: false,
    publicClient: {
      neonProjectId: publicAuthConfig.neonProjectId,
      neonAuthUrlConfigured: neonAuthConfigured,
      source: env.VITE_NEON_AUTH_URL ? 'vercel_environment' : 'canonical_public_config',
      legacySupabaseConfigured,
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
    oauthProviderDiscovery: false,
    supportedOAuthProviders: [],
    godModeIncluded: true,
    privilegedBootstrapDefault: false,
    sessionTransport: 'first_party_httponly_cookie_plus_short_lived_jwt',
  },
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Frontend build metadata written to ${outputPath}`);
