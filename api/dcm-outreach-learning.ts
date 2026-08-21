import type { IncomingMessage, ServerResponse } from 'node:http';

const RUNTIME = 'dcm-outreach-learning-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonObject = Record<string, unknown>;
type User = { id: string };

type Context = { baseUrl: string; anonKey: string; token: string; user: User };

const write = (res: ServerResponse, code: number, payload: unknown) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Origination-Runtime': RUNTIME, 'X-Robots-Tag': 'noindex' });
  res.end(JSON.stringify(payload));
};
const header = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '').trim();
const asArray = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
const body = async (req: IncomingMessage): Promise<JsonObject> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('JSON body must be an object.'), { statusCode: 400 });
  return parsed as JsonObject;
};
const authenticate = async (req: IncomingMessage): Promise<Context> => {
  const authorization = header(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
  const baseUrl = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!baseUrl || !anonKey) throw Object.assign(new Error('Supabase Auth is not configured.'), { statusCode: 503 });
  const token = authorization.slice('Bearer '.length);
  const auth = await fetch(`${baseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!auth.ok) throw Object.assign(new Error('Unauthorized.'), { statusCode: 401 });
  const user = await auth.json() as User;
  if (!UUID_PATTERN.test(user.id ?? '')) throw Object.assign(new Error('Invalid authenticated user.'), { statusCode: 401 });
  return { baseUrl, anonKey, token, user };
};
const rest = async (ctx: Context, path: string, init: RequestInit = {}, expected: number[] = [200]) => {
  const response = await fetch(`${ctx.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const raw = await response.text();
  const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
  if (!expected.includes(response.status)) throw Object.assign(new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed)), { statusCode: response.status >= 500 ? 502 : response.status });
  return parsed;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const ctx = await authenticate(req);
    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET') {
      const [feedback, rules] = await Promise.all([
        rest(ctx, 'dcm_outreach_feedback?select=*&feedback_status=in.(pending,reviewed)&order=created_at.desc&limit=100'),
        rest(ctx, 'dcm_outreach_learning_queue_v?select=*&status=in.(pending_review,reviewed)&limit=100'),
      ]);
      write(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: { feedback, rules } });
      return;
    }
    if (method !== 'POST') { write(res, 405, { status: 'partial', error: 'Method not allowed.' }); return; }

    const input = await body(req);
    const action = text(input.action);
    const id = text(input.id);
    if (!UUID_PATTERN.test(id)) throw Object.assign(new Error('A valid id is required.'), { statusCode: 422 });
    const now = new Date().toISOString();

    if (action === 'review_feedback') {
      const learnedRules = asArray(input.learnedRules ?? input.learned_rules);
      if (!learnedRules.length) throw Object.assign(new Error('At least one reviewed learned rule is required.'), { statusCode: 422 });
      const data = await rest(ctx, `dcm_outreach_feedback?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          learned_rules: learnedRules,
          change_summary: text(input.changeSummary, input.change_summary) || null,
          feedback_status: 'reviewed', reviewed_by: ctx.user.id, reviewed_at: now,
        }),
      });
      write(res, 200, { status: 'real', generatedAt: now, data });
      return;
    }

    if (action === 'set_rule_status') {
      const status = text(input.status);
      if (!new Set(['pending_review','reviewed','applied','rejected']).has(status)) throw Object.assign(new Error('Invalid rule status.'), { statusCode: 422 });
      const data = await rest(ctx, `dcm_outreach_learning_rules?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status, reviewed_by: ctx.user.id, reviewed_at: now }),
      });
      write(res, 200, { status: 'real', generatedAt: now, data });
      return;
    }

    throw Object.assign(new Error('Unsupported action.'), { statusCode: 400 });
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number((error as { statusCode?: unknown }).statusCode) || 500 : error instanceof SyntaxError ? 400 : 500;
    console.error('[dcm-outreach-learning]', error);
    write(res, statusCode, { status: 'partial', generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
  }
}
