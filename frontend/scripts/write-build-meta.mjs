import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const env = process.env;
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

const captchaEnabled = env.VITE_CAPTCHA_ENABLED !== 'false';
const captchaProvider = (env.VITE_CAPTCHA_PROVIDER || 'turnstile').trim().toLowerCase();
const captchaSiteKeyConfigured = Boolean((env.VITE_CAPTCHA_SITE_KEY || '').trim());

const metadata = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha,
  branch,
  environment: deploymentEnvironment,
  auth: {
    routes: [
      '/login',
      '/forgot-password',
      '/reset-password',
      '/auth/callback',
      '/profile',
      '/change-password',
      '/users',
    ],
    captcha: {
      enabled: captchaEnabled,
      provider: captchaProvider,
      siteKeyConfigured: captchaSiteKeyConfigured,
      tokenTransport: 'captcha_token',
    },
    googleOAuthButtonIncluded: true,
    godModeIncluded: true,
  },
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Frontend build metadata written to ${outputPath}`);
