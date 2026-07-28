import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';

type MicrosoftRequest = VercelRequest & { body?: Record<string, unknown> };
type JsonRecord = Record<string, any>;
type MicrosoftConnection = {
  user_id: string;
  status: 'active' | 'error' | 'disconnected';
  tenant_id?: string | null;
  microsoft_user_id?: string | null;
  account_email?: string | null;
  display_name?: string | null;
  granted_scopes?: string[] | null;
  access_token_encrypted?: string | null;
  refresh_token_encrypted: string;
  access_token_expires_at?: string | null;
  todo_list_id?: string | null;
  planner_plan_id?: string | null;
  planner_group_id?: string | null;
  planner_bucket_ids?: Record<string, string> | null;
  last_sync_at?: string | null;
  last_error?: string | null;
};

class ApiError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'ApiError';
  }
}

const RUNTIME = 'microsoft-planner-todo-v1';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Tasks.ReadWrite', 'Group.Read.All'];
const TODO_LIST_TITLE = 'Central de Execução';
const PLANNER_PLAN_TITLE = 'Central de Execução';
const PLANNER_BUCKETS = ['Inbox', 'Esta semana', 'Em andamento', 'Aguardando', 'Concluído'] as const;

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const errorStatus = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
const nowIso = () => new Date().toISOString();

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  return res.status(statusCode).json(payload);
};

const runtimeConfig = () => {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? '';
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common';
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? '';
  const tokenEncryptionKey = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY ?? '';
  const stateSecret = process.env.MICROSOFT_STATE_SECRET ?? '';
  const appBaseUrl = (process.env.APP_BASE_URL ?? 'https://motor-originac-srm.vercel.app').replace(/\/+$/, '');
  const plannerGroupId = process.env.MICROSOFT_PLANNER_GROUP_ID ?? '';
  const scopes = (process.env.MICROSOFT_SCOPES ?? DEFAULT_SCOPES.join(' ')).split(/\s+/).filter(Boolean);

  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new ApiError('Supabase runtime não está configurado.', 503);
  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    tokenEncryptionKey,
    stateSecret,
    appBaseUrl,
    plannerGroupId,
    scopes,
  };
};

const assertMicrosoftConfig = () => {
  const config = runtimeConfig();
  const missing = [
    ['MICROSOFT_CLIENT_ID', config.clientId],
    ['MICROSOFT_CLIENT_SECRET', config.clientSecret],
    ['MICROSOFT_REDIRECT_URI', config.redirectUri],
    ['MICROSOFT_TOKEN_ENCRYPTION_KEY', config.tokenEncryptionKey],
    ['MICROSOFT_STATE_SECRET', config.stateSecret],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new ApiError(`Integração Microsoft incompleta. Configure: ${missing.join(', ')}.`, 503);
  return config;
};

const serviceHeaders = (prefer = 'return=representation') => {
  const { serviceRoleKey } = runtimeConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
};

const authenticate = async (req: MicrosoftRequest) => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);
  const { supabaseUrl, anonKey } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok || typeof payload.id !== 'string') throw new ApiError('Unauthorized.', 401);
  return { id: payload.id as string, email: typeof payload.email === 'string' ? payload.email : undefined };
};

const isCronAuthorized = (req: MicrosoftRequest) => {
  const secret = process.env.CRON_SECRET ?? '';
  const received = requestValue(req.headers.authorization) ?? '';
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
};

const encodeBase64Url = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url');

const encryptionKey = () => createHash('sha256').update(assertMicrosoftConfig().tokenEncryptionKey).digest();
const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', encodeBase64Url(iv), encodeBase64Url(tag), encodeBase64Url(ciphertext)].join('.');
};
const decryptSecret = (value: string) => {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split('.');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !ciphertextEncoded) throw new ApiError('Token Microsoft armazenado em formato inválido.', 500);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), decodeBase64Url(ivEncoded));
  decipher.setAuthTag(decodeBase64Url(tagEncoded));
  return Buffer.concat([decipher.update(decodeBase64Url(ciphertextEncoded)), decipher.final()]).toString('utf8');
};

const signState = (payload: JsonRecord) => {
  const config = assertMicrosoftConfig();
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', config.stateSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};
const verifyState = (state: string) => {
  const config = assertMicrosoftConfig();
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) throw new ApiError('OAuth state inválido.', 400);
  const expected = createHmac('sha256', config.stateSecret).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new ApiError('OAuth state inválido.', 400);
  const payload = JSON.parse(decodeBase64Url(encoded).toString('utf8')) as JsonRecord;
  if (typeof payload.userId !== 'string' || Number(payload.expiresAt ?? 0) < Date.now()) throw new ApiError('OAuth state expirado.', 400);
  return payload as { userId: string; returnTo?: string; expiresAt: number; nonce: string };
};

const parseResponse = async (response: Response) => {
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  return payload;
};

const dbSelect = async <T>(table: string, params: Record<string, string>) => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: serviceHeaders() });
  const payload = await parseResponse(response);
  if (!response.ok) throw new ApiError(`Supabase select ${table} falhou (${response.status}): ${JSON.stringify(payload)}`, 502);
  return payload as T;
};

const dbUpsert = async <T>(table: string, rows: unknown[], onConflict: string) => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('on_conflict', onConflict);
  const response = await fetch(url, {
    method: 'POST',
    headers: serviceHeaders('return=representation,resolution=merge-duplicates'),
    body: JSON.stringify(rows),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw new ApiError(`Supabase upsert ${table} falhou (${response.status}): ${JSON.stringify(payload)}`, 502);
  return payload as T;
};

const dbInsert = async <T>(table: string, rows: unknown[]) => {
  const { supabaseUrl } = runtimeConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST', headers: serviceHeaders(), body: JSON.stringify(rows),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw new ApiError(`Supabase insert ${table} falhou (${response.status}): ${JSON.stringify(payload)}`, 502);
  return payload as T;
};

const dbUpdate = async <T>(table: string, filters: Record<string, string>, body: JsonRecord) => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(filters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: 'PATCH', headers: serviceHeaders(), body: JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw new ApiError(`Supabase update ${table} falhou (${response.status}): ${JSON.stringify(payload)}`, 502);
  return payload as T;
};

const dbDelete = async (table: string, filters: Record<string, string>) => {
  const { supabaseUrl } = runtimeConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(filters).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { method: 'DELETE', headers: serviceHeaders('return=minimal') });
  if (!response.ok) throw new ApiError(`Supabase delete ${table} falhou (${response.status}): ${await response.text()}`, 502);
};

const getConnection = async (userId: string) => {
  const rows = await dbSelect<MicrosoftConnection[]>('microsoft_connections', {
    select: '*', user_id: `eq.${userId}`, limit: '1',
  });
  return rows[0] ?? null;
};

const microsoftTokenRequest = async (body: URLSearchParams) => {
  const config = assertMicrosoftConfig();
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await parseResponse(response) as JsonRecord;
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new ApiError(`Microsoft OAuth falhou (${response.status}): ${payload.error_description ?? payload.error ?? 'resposta inválida'}`, 502);
  }
  return payload;
};

const refreshConnectionToken = async (connection: MicrosoftConnection) => {
  const config = assertMicrosoftConfig();
  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const payload = await microsoftTokenRequest(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
  }));
  const expiresAt = new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString();
  const updated = await dbUpdate<MicrosoftConnection[]>('microsoft_connections', { user_id: `eq.${connection.user_id}` }, {
    status: 'active',
    access_token_encrypted: encryptSecret(String(payload.access_token)),
    refresh_token_encrypted: encryptSecret(String(payload.refresh_token ?? refreshToken)),
    access_token_expires_at: expiresAt,
    granted_scopes: String(payload.scope ?? '').split(/\s+/).filter(Boolean),
    last_error: null,
    updated_at: nowIso(),
  });
  return { connection: updated[0] ?? connection, accessToken: String(payload.access_token) };
};

const getAccessToken = async (connection: MicrosoftConnection) => {
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 120_000) {
    return { connection, accessToken: decryptSecret(connection.access_token_encrypted) };
  }
  return refreshConnectionToken(connection);
};

const graphRequest = async <T>(accessToken: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(path.startsWith('http') ? path : `${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = await parseResponse(response) as JsonRecord;
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.error_description ?? `Microsoft Graph ${response.status}`;
    throw new ApiError(String(message), response.status === 401 ? 401 : 502);
  }
  return payload as T;
};

const graphCollection = async <T>(accessToken: string, path: string, maxPages = 5) => {
  const items: T[] = [];
  let next: string | undefined = path;
  let pages = 0;
  while (next && pages < maxPages) {
    const payload = await graphRequest<{ value?: T[]; '@odata.nextLink'?: string }>(accessToken, next);
    items.push(...(payload.value ?? []));
    next = payload['@odata.nextLink'];
    pages += 1;
  }
  return items;
};

const ensureTodoList = async (connection: MicrosoftConnection, accessToken: string) => {
  if (connection.todo_list_id) return connection.todo_list_id;
  const lists = await graphCollection<JsonRecord>(accessToken, '/me/todo/lists');
  let list = lists.find((item) => String(item.displayName ?? '').toLowerCase() === TODO_LIST_TITLE.toLowerCase());
  if (!list) {
    list = await graphRequest<JsonRecord>(accessToken, '/me/todo/lists', {
      method: 'POST', body: JSON.stringify({ displayName: TODO_LIST_TITLE }),
    });
  }
  if (!list?.id) throw new ApiError('Não foi possível criar ou localizar a lista do Microsoft To Do.', 502);
  await dbUpdate('microsoft_connections', { user_id: `eq.${connection.user_id}` }, { todo_list_id: list.id, updated_at: nowIso() });
  return String(list.id);
};

const ensurePlanner = async (connection: MicrosoftConnection, accessToken: string, requestedGroupId?: string) => {
  const config = runtimeConfig();
  const groupId = requestedGroupId || connection.planner_group_id || config.plannerGroupId;
  if (!groupId) return { enabled: false as const, reason: 'MICROSOFT_PLANNER_GROUP_ID não configurado.' };

  let planId = connection.planner_plan_id ?? '';
  if (!planId) {
    const plans = await graphCollection<JsonRecord>(accessToken, `/groups/${encodeURIComponent(groupId)}/planner/plans`);
    let plan = plans.find((item) => String(item.title ?? '').toLowerCase() === PLANNER_PLAN_TITLE.toLowerCase());
    if (!plan) {
      plan = await graphRequest<JsonRecord>(accessToken, '/planner/plans', {
        method: 'POST',
        body: JSON.stringify({
          container: { url: `${GRAPH_BASE}/groups/${groupId}` },
          title: PLANNER_PLAN_TITLE,
        }),
      });
    }
    if (!plan?.id) throw new ApiError('Não foi possível criar ou localizar o plano do Microsoft Planner.', 502);
    planId = String(plan.id);
  }

  const existingBuckets = await graphCollection<JsonRecord>(accessToken, `/planner/plans/${encodeURIComponent(planId)}/buckets`);
  const bucketIds: Record<string, string> = { ...(connection.planner_bucket_ids ?? {}) };
  for (const bucketName of PLANNER_BUCKETS) {
    let bucket = existingBuckets.find((item) => String(item.name ?? '').toLowerCase() === bucketName.toLowerCase());
    if (!bucket) {
      bucket = await graphRequest<JsonRecord>(accessToken, '/planner/buckets', {
        method: 'POST',
        body: JSON.stringify({ name: bucketName, planId, orderHint: ' !' }),
      });
    }
    if (bucket?.id) bucketIds[bucketName] = String(bucket.id);
  }

  await dbUpdate('microsoft_connections', { user_id: `eq.${connection.user_id}` }, {
    planner_group_id: groupId,
    planner_plan_id: planId,
    planner_bucket_ids: bucketIds,
    updated_at: nowIso(),
  });
  return { enabled: true as const, groupId, planId, bucketIds };
};

const normalizeTodoStatus = (status: string) => status === 'completed' ? 'done' : 'todo';
const normalizePlannerStatus = (percentComplete: number) => percentComplete >= 100 ? 'done' : percentComplete > 0 ? 'doing' : 'todo';
const hashTask = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const upsertTaskLinks = async (userId: string, provider: 'todo' | 'planner', containerId: string, tasks: JsonRecord[]) => {
  if (!tasks.length) return 0;
  const timestamp = nowIso();
  const rows = tasks.map((task) => {
    const dueRaw = provider === 'todo' ? task.dueDateTime?.dateTime : task.dueDateTime;
    const status = provider === 'todo' ? normalizeTodoStatus(String(task.status ?? 'notStarted')) : normalizePlannerStatus(Number(task.percentComplete ?? 0));
    return {
      user_id: userId,
      provider,
      external_task_id: String(task.id),
      external_container_id: containerId,
      external_etag: task['@odata.etag'] ?? null,
      title: String(task.title ?? ''),
      status,
      due_at: dueRaw ? new Date(String(dueRaw)).toISOString() : null,
      content_hash: hashTask({ title: task.title, status, dueRaw, bucketId: task.bucketId }),
      last_synced_at: timestamp,
      updated_at: timestamp,
    };
  });
  await dbUpsert('microsoft_task_links', rows, 'user_id,provider,external_task_id');
  return rows.length;
};

const insertSyncRun = async (input: {
  userId?: string | null;
  triggerType: 'manual' | 'cron' | 'bootstrap';
  status: 'running' | 'completed' | 'partial' | 'failed';
  todoItemsRead?: number;
  plannerItemsRead?: number;
  localItemsWritten?: number;
  externalItemsWritten?: number;
  errorMessage?: string | null;
  metadata?: JsonRecord;
  startedAt?: string;
  finishedAt?: string | null;
}) => dbInsert<JsonRecord[]>('microsoft_sync_runs', [{
  user_id: input.userId ?? null,
  trigger_type: input.triggerType,
  status: input.status,
  todo_items_read: input.todoItemsRead ?? 0,
  planner_items_read: input.plannerItemsRead ?? 0,
  local_items_written: input.localItemsWritten ?? 0,
  external_items_written: input.externalItemsWritten ?? 0,
  error_message: input.errorMessage ?? null,
  metadata: input.metadata ?? {},
  started_at: input.startedAt ?? nowIso(),
  finished_at: input.finishedAt ?? null,
}] as unknown[]);

const syncConnection = async (connection: MicrosoftConnection, triggerType: 'manual' | 'cron' | 'bootstrap') => {
  const startedAt = nowIso();
  let todoItemsRead = 0;
  let plannerItemsRead = 0;
  try {
    const token = await getAccessToken(connection);
    connection = token.connection;
    const todoListId = await ensureTodoList(connection, token.accessToken);
    const todoTasks = await graphCollection<JsonRecord>(token.accessToken, `/me/todo/lists/${encodeURIComponent(todoListId)}/tasks?$top=100`);
    todoItemsRead = todoTasks.length;
    const todoWritten = await upsertTaskLinks(connection.user_id, 'todo', todoListId, todoTasks);

    const planner = await ensurePlanner(connection, token.accessToken);
    let plannerWritten = 0;
    if (planner.enabled) {
      const plannerTasks = await graphCollection<JsonRecord>(token.accessToken, `/planner/plans/${encodeURIComponent(planner.planId)}/tasks`);
      plannerItemsRead = plannerTasks.length;
      plannerWritten = await upsertTaskLinks(connection.user_id, 'planner', planner.planId, plannerTasks);
    }

    await dbUpdate('microsoft_connections', { user_id: `eq.${connection.user_id}` }, {
      status: 'active', last_sync_at: nowIso(), last_error: null, updated_at: nowIso(),
    });
    await insertSyncRun({
      userId: connection.user_id,
      triggerType,
      status: 'completed',
      todoItemsRead,
      plannerItemsRead,
      localItemsWritten: todoWritten + plannerWritten,
      startedAt,
      finishedAt: nowIso(),
      metadata: { plannerEnabled: planner.enabled },
    });
    return { todoItemsRead, plannerItemsRead, linksWritten: todoWritten + plannerWritten, plannerEnabled: planner.enabled };
  } catch (error) {
    await dbUpdate('microsoft_connections', { user_id: `eq.${connection.user_id}` }, {
      status: 'error', last_error: errorMessage(error).slice(0, 1000), updated_at: nowIso(),
    }).catch(() => undefined);
    await insertSyncRun({
      userId: connection.user_id,
      triggerType,
      status: 'failed',
      todoItemsRead,
      plannerItemsRead,
      errorMessage: errorMessage(error),
      startedAt,
      finishedAt: nowIso(),
    }).catch(() => undefined);
    throw error;
  }
};

const connectionStatus = (connection: MicrosoftConnection | null) => {
  const config = runtimeConfig();
  const missingConfig = [
    ['MICROSOFT_CLIENT_ID', config.clientId],
    ['MICROSOFT_CLIENT_SECRET', config.clientSecret],
    ['MICROSOFT_REDIRECT_URI', config.redirectUri],
    ['MICROSOFT_TOKEN_ENCRYPTION_KEY', config.tokenEncryptionKey],
    ['MICROSOFT_STATE_SECRET', config.stateSecret],
  ].filter(([, value]) => !value).map(([key]) => key);
  return {
    configured: missingConfig.length === 0,
    missingConfig,
    connected: Boolean(connection && connection.status !== 'disconnected'),
    connection: connection ? {
      status: connection.status,
      accountEmail: connection.account_email,
      displayName: connection.display_name,
      tenantId: connection.tenant_id,
      todoListId: connection.todo_list_id,
      plannerPlanId: connection.planner_plan_id,
      plannerGroupId: connection.planner_group_id,
      plannerBuckets: connection.planner_bucket_ids ?? {},
      lastSyncAt: connection.last_sync_at,
      lastError: connection.last_error,
      grantedScopes: connection.granted_scopes ?? [],
    } : null,
  };
};

const workspaceSnapshot = async (connection: MicrosoftConnection) => {
  const token = await getAccessToken(connection);
  connection = token.connection;
  const todoListId = await ensureTodoList(connection, token.accessToken);
  const [todoLists, todoTasks] = await Promise.all([
    graphCollection<JsonRecord>(token.accessToken, '/me/todo/lists'),
    graphCollection<JsonRecord>(token.accessToken, `/me/todo/lists/${encodeURIComponent(todoListId)}/tasks?$top=100`),
  ]);
  const planner = await ensurePlanner(connection, token.accessToken);
  let plannerTasks: JsonRecord[] = [];
  let plannerBuckets: JsonRecord[] = [];
  if (planner.enabled) {
    [plannerTasks, plannerBuckets] = await Promise.all([
      graphCollection<JsonRecord>(token.accessToken, `/planner/plans/${encodeURIComponent(planner.planId)}/tasks`),
      graphCollection<JsonRecord>(token.accessToken, `/planner/plans/${encodeURIComponent(planner.planId)}/buckets`),
    ]);
  }
  return {
    todo: { listId: todoListId, lists: todoLists, tasks: todoTasks },
    planner: planner.enabled ? { enabled: true, planId: planner.planId, groupId: planner.groupId, buckets: plannerBuckets, tasks: plannerTasks } : { enabled: false, reason: planner.reason, buckets: [], tasks: [] },
  };
};

const createTask = async (connection: MicrosoftConnection, input: JsonRecord) => {
  const target = input.target === 'planner' ? 'planner' : 'todo';
  const title = String(input.title ?? '').trim();
  if (!title) throw new ApiError('title é obrigatório.', 400);
  const token = await getAccessToken(connection);
  connection = token.connection;
  let created: JsonRecord;
  let containerId: string;

  if (target === 'todo') {
    const listId = await ensureTodoList(connection, token.accessToken);
    const body: JsonRecord = { title };
    if (input.description) body.body = { content: String(input.description), contentType: 'text' };
    if (input.dueDate) body.dueDateTime = { dateTime: new Date(String(input.dueDate)).toISOString(), timeZone: 'UTC' };
    if (input.importance === 'high') body.importance = 'high';
    created = await graphRequest<JsonRecord>(token.accessToken, `/me/todo/lists/${encodeURIComponent(listId)}/tasks`, {
      method: 'POST', body: JSON.stringify(body),
    });
    containerId = listId;
  } else {
    const planner = await ensurePlanner(connection, token.accessToken, typeof input.groupId === 'string' ? input.groupId : undefined);
    if (!planner.enabled) throw new ApiError(planner.reason, 409);
    const requestedBucket = String(input.bucket ?? 'Inbox');
    const bucketId = planner.bucketIds[requestedBucket] ?? planner.bucketIds.Inbox;
    const body: JsonRecord = { planId: planner.planId, bucketId, title };
    if (input.dueDate) body.dueDateTime = new Date(String(input.dueDate)).toISOString();
    created = await graphRequest<JsonRecord>(token.accessToken, '/planner/tasks', { method: 'POST', body: JSON.stringify(body) });
    containerId = planner.planId;
  }

  await upsertTaskLinks(connection.user_id, target, containerId, [created]);
  return { target, task: created };
};

const callbackRedirect = (res: VercelResponse, path: string) => {
  const { appBaseUrl } = runtimeConfig();
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 302;
  res.setHeader('Location', `${appBaseUrl}${path}`);
  return res.end();
};

export default async function handler(req: MicrosoftRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    return res.status(204).json(null);
  }

  const operation = requestValue(req.query.operation) ?? 'status';
  try {
    if (operation === 'callback' && req.method === 'GET') {
      const code = requestValue(req.query.code);
      const stateRaw = requestValue(req.query.state);
      const oauthError = requestValue(req.query.error_description) ?? requestValue(req.query.error);
      if (oauthError) return callbackRedirect(res, `/task-center?microsoft=error&message=${encodeURIComponent(oauthError)}`);
      if (!code || !stateRaw) throw new ApiError('Callback Microsoft sem code/state.', 400);
      const state = verifyState(stateRaw);
      const config = assertMicrosoftConfig();
      const token = await microsoftTokenRequest(new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        scope: config.scopes.join(' '),
      }));
      if (typeof token.refresh_token !== 'string') throw new ApiError('Microsoft não retornou refresh_token. Confirme o escopo offline_access e refaça o consentimento.', 502);
      const me = await graphRequest<JsonRecord>(String(token.access_token), '/me?$select=id,displayName,mail,userPrincipalName');
      const expiresAt = new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000).toISOString();
      await dbUpsert('microsoft_connections', [{
        user_id: state.userId,
        status: 'active',
        tenant_id: token.id_token ? undefined : config.tenantId,
        microsoft_user_id: me.id,
        account_email: me.mail ?? me.userPrincipalName ?? null,
        display_name: me.displayName ?? null,
        granted_scopes: String(token.scope ?? config.scopes.join(' ')).split(/\s+/).filter(Boolean),
        access_token_encrypted: encryptSecret(String(token.access_token)),
        refresh_token_encrypted: encryptSecret(String(token.refresh_token)),
        access_token_expires_at: expiresAt,
        last_error: null,
        updated_at: nowIso(),
      }], 'user_id');
      return callbackRedirect(res, state.returnTo || '/task-center?microsoft=connected');
    }

    if (operation === 'cron-sync' && ['GET', 'POST'].includes(req.method ?? '')) {
      if (!isCronAuthorized(req)) throw new ApiError('Unauthorized Microsoft cron request.', 401);
      const connections = await dbSelect<MicrosoftConnection[]>('microsoft_connections', { select: '*', status: 'eq.active', limit: '100' });
      const results: JsonRecord[] = [];
      for (const connection of connections) {
        try {
          results.push({ userId: connection.user_id, ok: true, ...(await syncConnection(connection, 'cron')) });
        } catch (error) {
          results.push({ userId: connection.user_id, ok: false, error: errorMessage(error) });
        }
      }
      return writeJson(res, results.some((item) => !item.ok) ? 207 : 200, {
        status: results.some((item) => !item.ok) ? 'partial' : 'real', generatedAt: nowIso(), data: { connections: results.length, results },
      });
    }

    const user = await authenticate(req);
    const connection = await getConnection(user.id);

    if (operation === 'status' && req.method === 'GET') {
      return writeJson(res, 200, { status: 'real', generatedAt: nowIso(), data: connectionStatus(connection) });
    }

    if (operation === 'connect' && req.method === 'POST') {
      const config = assertMicrosoftConfig();
      const state = signState({
        userId: user.id,
        nonce: randomBytes(16).toString('hex'),
        expiresAt: Date.now() + 10 * 60 * 1000,
        returnTo: '/task-center?microsoft=connected',
      });
      const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('response_mode', 'query');
      url.searchParams.set('scope', config.scopes.join(' '));
      url.searchParams.set('state', state);
      url.searchParams.set('prompt', connection ? 'select_account' : 'consent');
      return writeJson(res, 200, { status: 'real', generatedAt: nowIso(), data: { authorizationUrl: url.toString() } });
    }

    if (operation === 'disconnect' && ['POST', 'DELETE'].includes(req.method ?? '')) {
      await dbDelete('microsoft_task_links', { user_id: `eq.${user.id}` });
      await dbDelete('microsoft_connections', { user_id: `eq.${user.id}` });
      return writeJson(res, 200, { status: 'real', generatedAt: nowIso(), data: { disconnected: true } });
    }

    if (!connection) throw new ApiError('Conta Microsoft ainda não conectada.', 409);

    if (operation === 'bootstrap' && req.method === 'POST') {
      const token = await getAccessToken(connection);
      const todoListId = await ensureTodoList(token.connection, token.accessToken);
      const planner = await ensurePlanner(token.connection, token.accessToken, typeof req.body?.groupId === 'string' ? req.body.groupId : undefined);
      const sync = await syncConnection(await getConnection(user.id) ?? token.connection, 'bootstrap');
      return writeJson(res, 200, { status: 'real', generatedAt: nowIso(), data: { todoListId, planner, sync } });
    }

    if (operation === 'workspace' && req.method === 'GET') {
      return writeJson(res, 200, { status: 'real', generatedAt: nowIso(), data: await workspaceSnapshot(connection) });
    }

    if (operation === 'sync' && req.method === 'POST') {
      return writeJson(res, 200, { status: 'real', generatedAt: nowIso(), data: await syncConnection(connection, 'manual') });
    }

    if (operation === 'create-task' && req.method === 'POST') {
      return writeJson(res, 201, { status: 'real', generatedAt: nowIso(), data: await createTask(connection, req.body ?? {}) });
    }

    return writeJson(res, 404, { status: 'partial', generatedAt: nowIso(), error: `Operação Microsoft não encontrada: ${operation}.` });
  } catch (error) {
    const statusCode = errorStatus(error);
    if (operation === 'callback' && statusCode >= 400) {
      return callbackRedirect(res, `/task-center?microsoft=error&message=${encodeURIComponent(errorMessage(error))}`);
    }
    if (statusCode >= 500) console.error('[microsoft-planner-todo]', error);
    return writeJson(res, statusCode, { status: 'partial', generatedAt: nowIso(), error: errorMessage(error) });
  }
}
