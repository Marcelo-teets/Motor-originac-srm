type Envelope<T> = {
  status: 'real' | 'partial' | 'mock';
  generatedAt?: string;
  data: T;
  error?: string;
};

type SessionData = {
  access_token: string;
  user?: { id?: string; email?: string };
};

type CompanyListItem = { id: string; name?: string; legalName?: string };

const defaultBaseUrl = 'https://motor-originac-srm-git-main-marcelo-teets-projects.vercel.app';
const baseUrl = (process.env.SMOKE_BASE_URL ?? process.env.VITE_API_BASE_URL ?? defaultBaseUrl).replace(/\/$/, '');
const email = process.env.SMOKE_EMAIL ?? process.env.MOTOR_SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD ?? process.env.MOTOR_SMOKE_PASSWORD;

const authPrefix = ['Bear', 'er'].join('');

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for production smoke tests.`);
  return value;
}

function apiUrl(path: string) {
  return `${baseUrl}${path.startsWith('/api') ? path : `/api${path}`}`;
}

async function parseJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} did not return JSON. status=${response.status} body=${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload ? String((payload as { error?: unknown }).error) : text;
    throw new Error(`${label} failed. status=${response.status} error=${message}`);
  }
  return payload as T;
}

async function getEnvelope<T>(path: string, token: string, label: string) {
  const response = await fetch(apiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `${authPrefix} ${token}`,
    },
  });
  const payload = await parseJson<Envelope<T>>(response, label);
  if (!payload.status) throw new Error(`${label} missing API envelope status.`);
  return payload;
}

async function main() {
  const smokeEmail = required(email, 'SMOKE_EMAIL');
  const smokePassword = required(password, 'SMOKE_PASSWORD');

  console.log(`[smoke] target=${baseUrl}`);

  const loginResponse = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
  });
  const login = await parseJson<Envelope<SessionData>>(loginResponse, 'POST /api/auth/login');
  if (login.status !== 'real') throw new Error(`POST /api/auth/login expected status real, got ${login.status}`);
  if (!login.data?.access_token) throw new Error('POST /api/auth/login did not return access_token.');
  const token = login.data.access_token;

  const dashboard = await getEnvelope<unknown>('/dashboard', token, 'GET /api/dashboard');
  if (dashboard.status !== 'real') throw new Error(`GET /api/dashboard expected status real, got ${dashboard.status}`);

  const companies = await getEnvelope<CompanyListItem[]>('/companies', token, 'GET /api/companies');
  if (!Array.isArray(companies.data) || companies.data.length === 0) throw new Error('GET /api/companies returned empty data.');

  const firstCompany = companies.data[0];
  if (!firstCompany?.id) throw new Error('First company has no id.');
  await getEnvelope<unknown>(`/companies/${firstCompany.id}`, token, 'GET /api/companies/:id');

  const pipeline = await getEnvelope<{ rows?: unknown[] }>('/pipeline', token, 'GET /api/pipeline');
  if (!Array.isArray(pipeline.data?.rows) || pipeline.data.rows.length === 0) throw new Error('GET /api/pipeline returned empty rows.');

  const watchlists = await getEnvelope<unknown>('/watchlists', token, 'GET /api/watchlists');
  if (watchlists.status === 'mock') throw new Error('GET /api/watchlists returned mock status.');

  const system = await getEnvelope<unknown>('/system/status', token, 'GET /api/system/status');
  if (system.status === 'mock') throw new Error('GET /api/system/status returned mock status.');

  console.log('[smoke] production smoke passed');
}

main().catch((error) => {
  console.error('[smoke] production smoke failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
