import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from '../serverless/neon-auth.js';
import { requireNeonDataClient } from '../serverless/neon-data.js';
import { readJsonObjectBody } from '../serverless/http-body.js';

const RUNTIME = 'dcm-daily-leads-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(['A', 'B', 'C', 'Reciclar']);
const STATUSES = new Set(['draft', 'ready', 'sent', 'repositioned', 'do_not_advance', 'missing_data']);

type JsonObject = Record<string, unknown>;
type AuthenticatedUser = { id: string; email?: string };

type DataContext = {
  user: AuthenticatedUser;
};

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
    'X-Robots-Tag': 'noindex',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const parseUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
};

const asObject = (value: unknown): JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
  ? value as JsonObject
  : {};
const text = (...values: unknown[]) => String(values.find((value) => typeof value === 'string' && value.trim()) ?? '').trim();
const nullableText = (...values: unknown[]) => text(...values) || null;
const asArray = (value: unknown) => Array.isArray(value) ? value : [];

const readJsonBody = (req: IncomingMessage) => readJsonObjectBody(req, 256_000);

const requireAuth = async (req: IncomingMessage): Promise<DataContext> => {
  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });

  const accessToken = authorization.slice('Bearer '.length);
  const { user: neonUser } = await verifyActiveIdentity(accessToken);
  const user: AuthenticatedUser = { id: neonUser.id, email: neonUser.email };
  if (!UUID_PATTERN.test(user.id)) throw Object.assign(new Error('Authenticated user is invalid.'), { statusCode: 401 });
  requireNeonDataClient();
  return { user };
};

const normalizeLinkedInUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^(www\.)?linkedin\.com$/i.test(url.hostname)) return value;
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
};

const loadLead = async (_context: DataContext, id: string) => {
  const rows = await requireNeonDataClient().select('dcm_daily_leads', {
    filters: [{ column: 'id', operator: 'eq', value: id }],
    limit: 1,
  }) as JsonObject[];
  return rows[0] ?? null;
};

const buildBriefing = (items: JsonObject[]) => {
  const count = (status: string) => items.filter((item) => item.outreach_status === status).length;
  return {
    total: items.length,
    ready: count('ready'),
    sent: count('sent'),
    drafts: count('draft'),
    repositioned: count('repositioned'),
    doNotAdvance: count('do_not_advance'),
    missingData: count('missing_data'),
    pendingFeedback: items.filter((item) => item.has_pending_feedback === true).length,
    priorityA: items.filter((item) => item.priority === 'A').length,
    nextActions: items
      .filter((item) => typeof item.next_action === 'string' && item.next_action.trim())
      .slice(0, 8)
      .map((item) => ({ id: item.id, companyName: item.company_name, contactName: item.contact_name, nextAction: item.next_action })),
  };
};

const listQueue = async (_context: DataContext, req: IncomingMessage) => {
  const url = parseUrl(req);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!DATE_PATTERN.test(date)) throw Object.assign(new Error('Invalid date. Use YYYY-MM-DD.'), { statusCode: 400 });
  const requestedStatus = url.searchParams.get('status');
  if (requestedStatus && !STATUSES.has(requestedStatus)) throw Object.assign(new Error('Invalid outreach status.'), { statusCode: 400 });

  const filters: Array<{ column: string; operator: 'eq'; value: string }> = [
    { column: 'generated_on', operator: 'eq', value: date },
  ];
  if (requestedStatus) filters.push({ column: 'outreach_status', operator: 'eq', value: requestedStatus });
  const payload = await requireNeonDataClient().select('dcm_daily_outreach_queue_v', {
    filters,
    limit: 200,
  });
  const priorityRank: Record<string, number> = { A: 0, B: 1, C: 2, Reciclar: 3 };
  const statusRank: Record<string, number> = { ready: 0, draft: 1, missing_data: 2, repositioned: 3, sent: 4, do_not_advance: 5 };
  const items = (Array.isArray(payload) ? payload.map(asObject) : []).sort((left, right) => {
    const priorityDelta = (priorityRank[text(left.priority)] ?? 9) - (priorityRank[text(right.priority)] ?? 9);
    if (priorityDelta) return priorityDelta;
    const statusDelta = (statusRank[text(left.outreach_status)] ?? 9) - (statusRank[text(right.outreach_status)] ?? 9);
    if (statusDelta) return statusDelta;
    return text(left.company_name, left.contact_name).localeCompare(text(right.company_name, right.contact_name), 'pt-BR');
  });
  return { date, items, briefing: buildBriefing(items) };
};

const createLead = async (context: DataContext, body: JsonObject) => {
  const companyId = text(body.companyId, body.company_id);
  const contactName = text(body.contactName, body.contact_name);
  const productHypothesis = text(body.productHypothesis, body.product_hypothesis);
  const thesis = text(body.thesis);
  const priority = text(body.priority, 'B');
  const outreachStatus = text(body.outreachStatus, body.outreach_status, 'draft');
  const generatedOn = text(body.generatedOn, body.generated_on, new Date().toISOString().slice(0, 10));

  if (!UUID_PATTERN.test(companyId)) throw Object.assign(new Error('companyId is required and must be a valid UUID.'), { statusCode: 422 });
  if (!contactName) throw Object.assign(new Error('contactName is required.'), { statusCode: 422 });
  if (!productHypothesis) throw Object.assign(new Error('productHypothesis is required.'), { statusCode: 422 });
  if (!thesis) throw Object.assign(new Error('thesis is required.'), { statusCode: 422 });
  if (!PRIORITIES.has(priority)) throw Object.assign(new Error('Invalid priority.'), { statusCode: 422 });
  if (!STATUSES.has(outreachStatus)) throw Object.assign(new Error('Invalid outreach status.'), { statusCode: 422 });
  if (!DATE_PATTERN.test(generatedOn)) throw Object.assign(new Error('generatedOn must use YYYY-MM-DD.'), { statusCode: 422 });

  const row = {
    company_id: companyId,
    contact_name: contactName,
    contact_role: nullableText(body.contactRole, body.contact_role),
    linkedin_url: normalizeLinkedInUrl(nullableText(body.linkedinUrl, body.linkedin_url)),
    product_hypothesis: productHypothesis,
    priority,
    thesis,
    generated_message: nullableText(body.generatedMessage, body.generated_message),
    actual_message: nullableText(body.actualMessage, body.actual_message),
    outreach_status: outreachStatus,
    recommended_skills: asArray(body.recommendedSkills ?? body.recommended_skills),
    source_trace: asArray(body.sourceTrace ?? body.source_trace),
    next_action: nullableText(body.nextAction, body.next_action),
    generated_on: generatedOn,
    created_by: context.user.id,
    updated_by: context.user.id,
  };

  const rows = await requireNeonDataClient().insert('dcm_daily_leads', [row]) as JsonObject[];
  return rows[0] ?? null;
};

const updateLead = async (context: DataContext, body: JsonObject) => {
  const id = text(body.id, body.leadId, body.lead_id);
  if (!UUID_PATTERN.test(id)) throw Object.assign(new Error('A valid lead id is required.'), { statusCode: 422 });

  const updates: JsonObject = { updated_at: new Date().toISOString(), updated_by: context.user.id };
  const mappings: Array<[string, string, (value: unknown) => unknown]> = [
    ['contactName', 'contact_name', (value) => text(value)],
    ['contactRole', 'contact_role', (value) => nullableText(value)],
    ['linkedinUrl', 'linkedin_url', (value) => normalizeLinkedInUrl(nullableText(value))],
    ['productHypothesis', 'product_hypothesis', (value) => text(value)],
    ['priority', 'priority', (value) => text(value)],
    ['thesis', 'thesis', (value) => text(value)],
    ['generatedMessage', 'generated_message', (value) => nullableText(value)],
    ['outreachStatus', 'outreach_status', (value) => text(value)],
    ['recommendedSkills', 'recommended_skills', (value) => asArray(value)],
    ['sourceTrace', 'source_trace', (value) => asArray(value)],
    ['nextAction', 'next_action', (value) => nullableText(value)],
  ];
  for (const [camel, snake, normalizer] of mappings) {
    const raw = body[camel] ?? body[snake];
    if (raw !== undefined) updates[snake] = normalizer(raw);
  }
  if (updates.priority && !PRIORITIES.has(String(updates.priority))) throw Object.assign(new Error('Invalid priority.'), { statusCode: 422 });
  if (updates.outreach_status && !STATUSES.has(String(updates.outreach_status))) throw Object.assign(new Error('Invalid outreach status.'), { statusCode: 422 });
  if (Object.keys(updates).length <= 2) throw Object.assign(new Error('No supported fields were provided.'), { statusCode: 422 });

  const rows = await requireNeonDataClient().update(
    'dcm_daily_leads',
    updates,
    [{ column: 'id', operator: 'eq', value: id }],
  ) as JsonObject[];
  if (!rows.length) throw Object.assign(new Error('Lead not found or not accessible.'), { statusCode: 404 });
  return rows[0];
};

const sendLead = async (context: DataContext, body: JsonObject) => {
  const id = text(body.id, body.leadId, body.lead_id);
  const actualMessage = text(body.actualMessage, body.actual_message);
  if (!UUID_PATTERN.test(id)) throw Object.assign(new Error('A valid lead id is required.'), { statusCode: 422 });
  if (!actualMessage) throw Object.assign(new Error('actualMessage is required before marking the outreach as sent.'), { statusCode: 422 });

  const current = await loadLead(context, id);
  if (!current) throw Object.assign(new Error('Lead not found or not accessible.'), { statusCode: 404 });
  const now = new Date().toISOString();
  const nextAction = nullableText(body.nextAction, body.next_action, current.next_action);
  const patched = await requireNeonDataClient().update('dcm_daily_leads', {
    actual_message: actualMessage,
    outreach_status: 'sent',
    sent_at: now,
    next_action: nextAction,
    updated_at: now,
    updated_by: context.user.id,
  }, [{ column: 'id', operator: 'eq', value: id }]) as JsonObject[];
  const lead = patched[0] ?? null;

  const generatedMessage = text(current.generated_message);
  let feedbackCreated = false;
  if (generatedMessage && generatedMessage !== actualMessage) {
    const existingPayload = await requireNeonDataClient().select('dcm_outreach_feedback', {
      select: 'id,generated_message,actual_message',
      filters: [{ column: 'daily_lead_id', operator: 'eq', value: id }],
      limit: 100,
    }) as JsonObject[];
    const duplicate = existingPayload.some((feedback) => (
      feedback.generated_message === generatedMessage && feedback.actual_message === actualMessage
    ));
    if (!duplicate) {
      await requireNeonDataClient().insert('dcm_outreach_feedback', [{
        daily_lead_id: id,
        generated_message: generatedMessage,
        actual_message: actualMessage,
        change_summary: nullableText(body.changeSummary, body.change_summary, 'Mensagem ajustada pelo usuário antes do envio.'),
        learned_rules: asArray(body.learnedRules ?? body.learned_rules),
        feedback_status: 'pending',
      }]);
      feedbackCreated = true;
    }
  }

  return { lead, feedbackCreated };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const context = await requireAuth(req);
    const method = (req.method ?? 'GET').toUpperCase();

    if (method === 'GET') {
      const data = await listQueue(context, req);
      writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const action = text(body.action, 'create');
      const data = action === 'send' ? await sendLead(context, body) : action === 'create' ? await createLead(context, body) : null;
      if (!data) throw Object.assign(new Error('Unsupported action.'), { statusCode: 400 });
      writeJson(res, action === 'create' ? 201 : 200, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const data = await updateLead(context, body);
      writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data });
      return;
    }

    writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode) || 500
      : error instanceof SyntaxError ? 400 : 500;
    console.error('[dcm-daily-leads]', error);
    writeJson(res, statusCode, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
