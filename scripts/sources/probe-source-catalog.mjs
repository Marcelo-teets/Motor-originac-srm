const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

const api = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 500)}`);
  if (response.status === 204) return null;
  return response.json();
};

const isPublicAuth = (value) => ['', 'none', 'public', 'no_auth', 'not_required'].includes(String(value ?? '').trim().toLowerCase());

const probeUrl = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0', Accept: '*/*' },
        redirect: 'follow',
        signal: controller.signal,
      });
    }
    return { reachable: response.status >= 200 && response.status < 400, httpStatus: response.status, finalUrl: response.url };
  } catch (error) {
    return { reachable: false, httpStatus: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
};

const rows = await api('/rest/v1/source_schedule_coverage?select=source_id,name,source_code,source_url,source_type,auth_requirement,status,health,source_metadata,runner,cadence,workflow_file,enabled&runner=eq.source_probe&enabled=eq.true');
const results = [];

for (const source of rows) {
  const observedAt = new Date().toISOString();
  let result;
  if (!source.source_url) {
    result = { probeStatus: 'blocked', reason: 'missing_source_url' };
  } else if (!isPublicAuth(source.auth_requirement)) {
    result = { probeStatus: 'blocked', reason: 'authorization_required', authRequirement: source.auth_requirement };
  } else {
    const probe = await probeUrl(source.source_url);
    result = { probeStatus: probe.reachable ? 'reachable' : 'unreachable', ...probe };
  }

  const metadata = {
    ...(source.source_metadata ?? {}),
    lastActivationProbe: { ...result, observedAt, workflow: '.github/workflows/source-activation-probes.yml' },
  };
  await api(`/rest/v1/source_catalog?id=eq.${encodeURIComponent(source.source_id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ metadata, updated_at: observedAt }),
  });
  results.push({ source: source.name, sourceCode: source.source_code, ...result });
}

const counts = results.reduce((acc, item) => {
  acc[item.probeStatus] = (acc[item.probeStatus] ?? 0) + 1;
  return acc;
}, {});
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), counts, results }, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises');
  const lines = [
    '## Source activation probes',
    '',
    `Total: ${results.length}`,
    '',
    '| fonte | código | resultado | detalhe |',
    '|---|---|---|---|',
    ...results.map((item) => `| ${item.source} | ${item.sourceCode ?? ''} | ${item.probeStatus} | ${item.reason ?? item.httpStatus ?? item.error ?? ''} |`),
    '',
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}
