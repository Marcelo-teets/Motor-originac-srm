import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './vercelTypes.js';

type JsonRecord = Record<string, any>;

const RUNTIME = 'free-inference-e2e-smoke-v1';
const FREE_INFERENCE_BASE_URL = (process.env.FREE_INFERENCE_BASE_URL ?? 'https://hungry-mountainous-harddrives--antunespmarcelo.replit.app').replace(/\/+$/, '');
const FREE_INFERENCE_MODEL = process.env.FREE_INFERENCE_MODEL ?? 'motor-local';

const writeJson = (res: VercelResponse, statusCode: number, payload: unknown) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Origination-Runtime', RUNTIME);
  res.setHeader('X-AI-Cost-Policy', 'free-only');
  return res.status(statusCode).json(payload);
};

const requestValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const isCronAuthorized = (req: VercelRequest) => {
  const secret = process.env.CRON_SECRET ?? '';
  const received = requestValue(req.headers.authorization) ?? '';
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return Boolean(secret && left.length === right.length && timingSafeEqual(left, right));
};

const extractText = (payload: JsonRecord) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => typeof item?.text === 'string' ? item.text : '').join('\n').trim();
  }
  return '';
};

const getJson = async (path: string, timeoutMs: number) => {
  const response = await fetch(`${FREE_INFERENCE_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null) as JsonRecord | null;
  return { response, payload };
};

const runSmoke = async () => {
  const [{ response: healthResponse }, { response: modelsResponse, payload: modelsPayload }] = await Promise.all([
    getJson('/health', 8_000),
    getJson('/v1/models', 8_000),
  ]);

  const chatResponse = await fetch(`${FREE_INFERENCE_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: FREE_INFERENCE_MODEL,
      temperature: 0,
      max_tokens: 32,
      stream: false,
      messages: [
        { role: 'system', content: 'You are a production connectivity smoke test. Return one short non-empty response.' },
        { role: 'user', content: 'Reply with MOTOR_SMOKE_OK.' },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const chatPayload = await chatResponse.json().catch(() => ({})) as JsonRecord;
  const text = extractText(chatPayload);
  const advertisedModels = Array.isArray(modelsPayload?.data)
    ? modelsPayload.data.map((item: JsonRecord) => String(item?.id ?? '')).filter(Boolean).slice(0, 10)
    : [];

  const ok = healthResponse.ok && modelsResponse.ok && chatResponse.ok && text.length > 0;
  return {
    ok,
    provider: 'motor-free-inference-node',
    modelConfigured: FREE_INFERENCE_MODEL,
    healthHttpStatus: healthResponse.status,
    modelsHttpStatus: modelsResponse.status,
    chatHttpStatus: chatResponse.status,
    advertisedModels,
    responseChars: text.length,
    markerMatched: text.toUpperCase().includes('MOTOR_SMOKE_OK'),
    costPolicy: 'free-only',
    zeroCostPolicy: 'locked',
    paidFallbackEnabled: false,
    paidProviderAttempted: false,
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Method not allowed.' });
  }
  if (!isCronAuthorized(req)) {
    return writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized smoke request.' });
  }

  try {
    const data = await runSmoke();
    return writeJson(res, data.ok ? 200 : 502, {
      status: data.ok ? 'real' : 'partial',
      generatedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    return writeJson(res, 502, {
      status: 'partial',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      data: {
        provider: 'motor-free-inference-node',
        modelConfigured: FREE_INFERENCE_MODEL,
        costPolicy: 'free-only',
        zeroCostPolicy: 'locked',
        paidFallbackEnabled: false,
        paidProviderAttempted: false,
      },
    });
  }
}
