import type { VercelRequest, VercelResponse } from './vercelTypes.js';

type TaskAiRequest = VercelRequest & { body?: Record<string, unknown> };
type JsonRecord = Record<string, any>;

type PlannedTask = {
  title: string;
  description: string;
  target: 'todo' | 'planner';
  dueDate: string | null;
  importance: 'normal' | 'high';
  bucket: 'Inbox' | 'Esta semana' | 'Em andamento' | 'Aguardando' | 'Concluído';
  rationale: string;
};

class ApiError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'ApiError';
  }
}

const RUNTIME = 'task-ai-free-inference-v2';
const FREE_INFERENCE_BASE_URL = (process.env.FREE_INFERENCE_BASE_URL ?? 'https://hungry-mountainous-harddrives--antunespmarcelo.replit.app').replace(/\/+$/, '');
const FREE_INFERENCE_MODEL = process.env.FREE_INFERENCE_MODEL ?? 'motor-local';
const ALLOWED_BUCKETS = ['Inbox', 'Esta semana', 'Em andamento', 'Aguardando', 'Concluído'] as const;
const MAX_PROMPT_LENGTH = 12_000;

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  res.setHeader('X-AI-Cost-Policy', 'free-only');
  return res.status(statusCode).json(payload);
};

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const errorStatus = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;

const runtimeStatus = () => ({
  provider: 'motor-free-inference-node',
  model: FREE_INFERENCE_MODEL,
  baseUrlConfigured: Boolean(FREE_INFERENCE_BASE_URL),
  paidFallbackEnabled: false,
  approvalRequired: true,
});

const authenticate = async (req: TaskAiRequest) => {
  const authorization = requestValue(req.headers.authorization);
  if (!authorization?.startsWith('Bearer ')) throw new ApiError('Missing bearer token.', 401);
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) throw new ApiError('Supabase Auth não está configurado.', 503);
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok || typeof payload.id !== 'string') throw new ApiError('Unauthorized.', 401);
  return { id: payload.id as string, email: typeof payload.email === 'string' ? payload.email : undefined };
};

const systemInstructions = () => {
  const now = new Date();
  const localNow = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(now);
  return [
    'Você é o planejador de tarefas da Central de Execução da Origination Intelligence Platform.',
    `Data e hora de referência em America/Sao_Paulo: ${localNow}.`,
    'Converta o pedido do usuário em tarefas claras, acionáveis e sem duplicidade.',
    'Use target=todo para tarefas pessoais e target=planner para trabalho compartilhado ou projetos.',
    'Só defina dueDate quando o usuário indicar prazo ou quando uma data relativa puder ser interpretada com segurança.',
    'Não invente nomes, responsáveis, datas, números ou fatos ausentes.',
    'A saída será revisada por uma pessoa antes de qualquer criação no Microsoft 365.',
    'Responda SOMENTE JSON válido no formato {"summary":"...","tasks":[...]}.',
    'Cada task deve conter title, description, target, dueDate, importance, bucket e rationale.',
    `bucket deve ser um de: ${ALLOWED_BUCKETS.join(', ')}.`,
  ].join(' ');
};

const parseJson = (value: string) => {
  const trimmed = value.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as JsonRecord;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as JsonRecord;
    throw new ApiError('O modelo gratuito não retornou um plano JSON válido.', 502);
  }
};

const validatePlan = (raw: JsonRecord) => {
  if (typeof raw.summary !== 'string' || !Array.isArray(raw.tasks) || !raw.tasks.length) {
    throw new ApiError('O modelo gratuito retornou um plano incompleto.', 502);
  }
  const tasks: PlannedTask[] = raw.tasks.slice(0, 20).map((item: JsonRecord, index: number) => {
    const title = String(item?.title ?? '').trim().slice(0, 180);
    if (!title) throw new ApiError(`A tarefa ${index + 1} não possui título.`, 502);
    const target: PlannedTask['target'] = item?.target === 'planner' ? 'planner' : 'todo';
    const dueDate = item?.dueDate ? new Date(String(item.dueDate)) : null;
    const bucket = ALLOWED_BUCKETS.includes(item?.bucket) ? item.bucket : 'Inbox';
    return {
      title,
      description: String(item?.description ?? '').trim().slice(0, 3000),
      target,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null,
      importance: item?.importance === 'high' ? 'high' : 'normal',
      bucket,
      rationale: String(item?.rationale ?? 'Tarefa derivada do pedido informado.').trim().slice(0, 500),
    };
  });
  return { summary: raw.summary.trim().slice(0, 800), tasks };
};

const extractText = (payload: JsonRecord) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((item) => typeof item?.text === 'string' ? item.text : '').join('\n').trim();
  return '';
};

const planWithFreeNode = async (prompt: string) => {
  const response = await fetch(`${FREE_INFERENCE_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FREE_INFERENCE_MODEL,
      temperature: 0.1,
      max_tokens: 1024,
      stream: false,
      messages: [
        { role: 'system', content: systemInstructions() },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new ApiError(`Motor Free Inference Node HTTP ${response.status}`, 502);
  const text = extractText(payload);
  if (!text) throw new ApiError('Motor Free Inference Node retornou resposta vazia.', 502);
  return { provider: 'motor-free-inference-node' as const, model: FREE_INFERENCE_MODEL, plan: validatePlan(parseJson(text)) };
};

export default async function handler(req: TaskAiRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return res.status(204).json(null);
  }

  try {
    await authenticate(req);
    if (req.method === 'GET') {
      return writeJson(res, 200, { status: 'real', generatedAt: new Date().toISOString(), data: runtimeStatus() });
    }
    if (req.method !== 'POST') throw new ApiError('Method not allowed.', 405);

    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) throw new ApiError('Descreva a atividade que deseja organizar.', 400);
    if (prompt.length > MAX_PROMPT_LENGTH) throw new ApiError(`O pedido deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres.`, 400);

    const result = await planWithFreeNode(prompt);
    return writeJson(res, 200, {
      status: 'real',
      generatedAt: new Date().toISOString(),
      data: { ...result, approvalRequired: true, paidFallbackEnabled: false },
    });
  } catch (error) {
    const statusCode = errorStatus(error);
    if (statusCode >= 500) console.error('[task-ai]', error);
    return writeJson(res, statusCode, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: errorMessage(error),
      paidFallbackAttempted: false,
    });
  }
}
