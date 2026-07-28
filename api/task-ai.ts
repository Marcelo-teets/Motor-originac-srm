import type { VercelRequest, VercelResponse } from './vercelTypes.js';

type TaskAiRequest = VercelRequest & { body?: Record<string, unknown> };
type JsonRecord = Record<string, any>;
type Provider = 'auto' | 'openai' | 'anthropic';

class ApiError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'ApiError';
  }
}

const RUNTIME = 'task-ai-gpt-claude-v1';
const ALLOWED_BUCKETS = ['Inbox', 'Esta semana', 'Em andamento', 'Aguardando', 'Concluído'] as const;
const MAX_PROMPT_LENGTH = 12_000;

const taskSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'tasks'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'target', 'dueDate', 'importance', 'bucket', 'rationale'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 180 },
          description: { type: 'string', maxLength: 3000 },
          target: { type: 'string', enum: ['todo', 'planner'] },
          dueDate: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
          importance: { type: 'string', enum: ['normal', 'high'] },
          bucket: { type: 'string', enum: ALLOWED_BUCKETS },
          rationale: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
  },
} as const;

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  return res.status(statusCode).json(payload);
};

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const errorStatus = (error: unknown) => typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;

const runtimeStatus = () => ({
  openai: {
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_TASK_MODEL ?? 'gpt-5-mini',
  },
  anthropic: {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_TASK_MODEL ?? 'claude-sonnet-4-20250514',
  },
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
    'Você é o planejador de tarefas da Central de Execução.',
    `Data e hora de referência em America/Sao_Paulo: ${localNow}.`,
    'Converta o pedido do usuário em tarefas claras, acionáveis e sem duplicidade.',
    'Use target=todo para tarefas pessoais, lembretes e preparação individual.',
    'Use target=planner para trabalho compartilhado, projetos, entregas de equipe ou itens com responsáveis.',
    'Só defina dueDate quando o usuário indicar prazo ou quando uma data relativa puder ser interpretada com segurança.',
    'Não invente nomes, responsáveis, datas, números ou fatos ausentes.',
    'Use bucket=Inbox quando não houver contexto suficiente; use Concluído apenas quando o pedido disser que a tarefa já terminou.',
    'Divida trabalhos complexos em etapas pequenas, ordenadas e executáveis.',
    'A saída será revisada por uma pessoa antes de qualquer criação no Microsoft 365.',
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
    throw new ApiError('A IA não retornou um plano JSON válido.', 502);
  }
};

const validatePlan = (raw: JsonRecord) => {
  if (typeof raw.summary !== 'string' || !Array.isArray(raw.tasks) || !raw.tasks.length) {
    throw new ApiError('A IA retornou um plano incompleto.', 502);
  }
  const tasks = raw.tasks.slice(0, 20).map((item: JsonRecord, index: number) => {
    const title = String(item?.title ?? '').trim().slice(0, 180);
    if (!title) throw new ApiError(`A tarefa ${index + 1} não possui título.`, 502);
    const target = item?.target === 'planner' ? 'planner' : 'todo';
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

const extractOpenAiText = (payload: JsonRecord) => {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const parts: string[] = [];
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
};

const planWithOpenAi = async (prompt: string) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ApiError('OPENAI_API_KEY não configurada.', 503);
  const model = process.env.OPENAI_TASK_MODEL ?? 'gpt-5-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: systemInstructions(),
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'task_plan',
          description: 'Plano estruturado de tarefas para Microsoft To Do e Planner.',
          strict: true,
          schema: taskSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new ApiError(`OpenAI API ${response.status}: ${payload?.error?.message ?? 'falha desconhecida'}`, 502);
  const text = extractOpenAiText(payload);
  if (!text) throw new ApiError('OpenAI retornou uma resposta vazia.', 502);
  return { provider: 'openai' as const, model, plan: validatePlan(parseJson(text)) };
};

const planWithAnthropic = async (prompt: string) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ApiError('ANTHROPIC_API_KEY não configurada.', 503);
  const model = process.env.ANTHROPIC_TASK_MODEL ?? 'claude-sonnet-4-20250514';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: systemInstructions(),
      messages: [{ role: 'user', content: prompt }],
      tools: [{
        name: 'submit_task_plan',
        description: 'Retorna o plano final de tarefas para revisão humana.',
        input_schema: taskSchema,
      }],
      tool_choice: { type: 'tool', name: 'submit_task_plan' },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new ApiError(`Anthropic API ${response.status}: ${payload?.error?.message ?? 'falha desconhecida'}`, 502);
  const toolUse = (Array.isArray(payload.content) ? payload.content : []).find((item: JsonRecord) => item?.type === 'tool_use' && item?.name === 'submit_task_plan');
  if (!toolUse?.input) throw new ApiError('Claude não retornou o plano estruturado esperado.', 502);
  return { provider: 'anthropic' as const, model, plan: validatePlan(toolUse.input as JsonRecord) };
};

const selectProvider = (requested: Provider) => {
  const status = runtimeStatus();
  if (requested === 'openai') return 'openai' as const;
  if (requested === 'anthropic') return 'anthropic' as const;
  if (status.openai.configured) return 'openai' as const;
  if (status.anthropic.configured) return 'anthropic' as const;
  throw new ApiError('Nenhum provedor de IA configurado. Cadastre OPENAI_API_KEY ou ANTHROPIC_API_KEY.', 503);
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
    const requested = String(req.body?.provider ?? 'auto') as Provider;
    if (!prompt) throw new ApiError('Descreva a atividade que deseja organizar.', 400);
    if (prompt.length > MAX_PROMPT_LENGTH) throw new ApiError(`O pedido deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres.`, 400);
    if (!['auto', 'openai', 'anthropic'].includes(requested)) throw new ApiError('Provedor inválido.', 400);

    const provider = selectProvider(requested);
    const result = provider === 'openai' ? await planWithOpenAi(prompt) : await planWithAnthropic(prompt);
    return writeJson(res, 200, {
      status: 'real',
      generatedAt: new Date().toISOString(),
      data: { ...result, approvalRequired: true },
    });
  } catch (error) {
    const statusCode = errorStatus(error);
    if (statusCode >= 500) console.error('[task-ai]', error);
    return writeJson(res, statusCode, { status: 'partial', generatedAt: new Date().toISOString(), error: errorMessage(error) });
  }
}
