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
const supabaseUrlConfigured = Boolean(resolvedSupabaseUrl);
const publishableKeyConfigured = Boolean(resolvedPublishableKey);
const emailPasswordConfigured = supabaseUrlConfigured && publishableKeyConfigured;

const metadata = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha,
  branch,
  environment: deploymentEnvironment,
  auth: {
    mode: emailPasswordConfigured ? 'email_password_and_oauth' : 'misconfigured',
    emailPasswordConfigured,
    oauthFallbackSupported: emailPasswordConfigured,
    publicClient: {
      projectRef: publicAuthConfig.supabaseProjectRef,
      supabaseUrlConfigured,
      publishableKeyConfigured,
      source: env.VITE_SUPABASE_URL && (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)
        ? 'vercel_environment'
        : 'canonical_public_config',
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
    oauthProviderDiscovery: emailPasswordConfigured,
    supportedOAuthProviders: ['github', 'google'],
    godModeIncluded: true,
  },
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Frontend build metadata written to ${outputPath}`);
