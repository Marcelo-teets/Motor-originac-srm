import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SENSITIVE_KEY = /(secret|token|password|private|key$)/i;
const CAPTCHA_KEY = /captcha/i;
const PROVIDER_KEY = /captcha.*provider|provider.*captcha/i;
const ENABLED_KEY = /captcha.*enabled|enabled.*captcha/i;
const SITE_KEY = /captcha.*site.*key|site.*key.*captcha/i;

const primitive = (value) => (
  value === null || ['string', 'number', 'boolean'].includes(typeof value)
);

const flatten = (value, prefix = '', entries = []) => {
  if (!value || typeof value !== 'object') return entries;

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (primitive(child)) entries.push({ path, key, value: child });
    else flatten(child, path, entries);
  }

  return entries;
};

const normalizedProvider = (value) => {
  const provider = String(value ?? '').trim().toLowerCase();
  if (provider === 'turnstile' || provider === 'cloudflare_turnstile') return 'turnstile';
  if (provider === 'hcaptcha' || provider === 'h_captcha') return 'hcaptcha';
  return provider || null;
};

const normalizedBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
};

export const sanitizeSupabaseAuthConfig = (config) => {
  const entries = flatten(config);
  const captchaEntries = entries.filter(({ path }) => CAPTCHA_KEY.test(path));
  const providerEntry = captchaEntries.find(({ path }) => PROVIDER_KEY.test(path));
  const enabledEntry = captchaEntries.find(({ path }) => ENABLED_KEY.test(path));
  const secretEntries = captchaEntries.filter(({ path }) => SENSITIVE_KEY.test(path) && !SITE_KEY.test(path));
  const siteKeyEntries = captchaEntries.filter(({ path }) => SITE_KEY.test(path));

  return {
    captcha: {
      enabled: enabledEntry ? normalizedBoolean(enabledEntry.value) : null,
      provider: providerEntry ? normalizedProvider(providerEntry.value) : null,
      secretConfigured: secretEntries.some(({ value }) => Boolean(String(value ?? '').trim())),
      siteKeyConfiguredInAuthConfig: siteKeyEntries.some(({ value }) => Boolean(String(value ?? '').trim())),
      discoveredConfigPaths: captchaEntries.map(({ path }) => path).sort(),
    },
    oauth: {
      githubEnabled: normalizedBoolean(config?.external_github_enabled ?? config?.external?.github),
      googleEnabled: normalizedBoolean(config?.external_google_enabled ?? config?.external?.google),
    },
  };
};

const writeSummary = (report) => {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '# Supabase Auth Configuration Audit',
    '',
    `- Management token configured: **${report.managementTokenConfigured}**`,
    `- API status: **${report.status}**`,
    `- CAPTCHA enabled: **${report.config?.captcha?.enabled ?? 'unknown'}**`,
    `- CAPTCHA provider: **${report.config?.captcha?.provider ?? 'unknown'}**`,
    `- CAPTCHA secret configured: **${report.config?.captcha?.secretConfigured ?? 'unknown'}**`,
    `- GitHub OAuth enabled: **${report.config?.oauth?.githubEnabled ?? 'unknown'}**`,
    `- Google OAuth enabled: **${report.config?.oauth?.googleEnabled ?? 'unknown'}**`,
    '',
    'Sensitive values are never written to logs or artifacts.',
    '',
  ].join('\n'));
};

export const auditSupabaseAuthConfig = async ({
  projectRef,
  accessToken,
  fetchImpl = fetch,
} = {}) => {
  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF is required.');

  if (!accessToken) {
    return {
      status: 'blocked',
      reason: 'SUPABASE_ACCESS_TOKEN is not configured in GitHub Actions.',
      managementTokenConfigured: false,
      projectRef,
      config: null,
    };
  }

  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'motor-originacao-auth-config-audit/1.0',
    },
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      status: 'failed',
      reason: `Supabase Management API returned HTTP ${response.status}.`,
      managementTokenConfigured: true,
      projectRef,
      config: null,
    };
  }

  return {
    status: 'passed',
    managementTokenConfigured: true,
    projectRef,
    config: sanitizeSupabaseAuthConfig(payload),
  };
};

const main = async () => {
  const report = await auditSupabaseAuthConfig({
    projectRef: process.env.SUPABASE_PROJECT_REF || 'hdghpmssudrqhsbvrdyt',
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  });

  const outputPath = process.env.AUTH_CONFIG_AUDIT_OUTPUT || 'supabase-auth-config-audit.json';
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  writeSummary(report);

  if (report.status !== 'passed' && process.env.REQUIRE_SUPABASE_ACCESS_TOKEN === 'true') {
    process.exitCode = 1;
  }
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
