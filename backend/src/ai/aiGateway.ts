/**
 * AIGateway — Motor Originação SRM
 *
 * Política free-first:
 * - usa exclusivamente o Motor Inference Node (modelo open-source local) por padrão;
 * - não aciona OpenAI/Anthropic automaticamente;
 * - quando o nó gratuito estiver indisponível, retorna fallback governado sem gerar custo.
 *
 * Variáveis opcionais:
 *   FREE_INFERENCE_BASE_URL=https://...replit.app
 *   FREE_INFERENCE_MODEL=motor-local
 */
import type { LLMGateway } from './types.js';

export type CompletionOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_BASE_URL = 'https://hungry-mountainous-harddrives--antunespmarcelo.replit.app';
const DEFAULT_MODEL = 'motor-local';
const DEFAULT_MAX_TOKENS = 768;
const DEFAULT_TEMPERATURE = 0.2;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export class AIGateway implements LLMGateway {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = normalizeBaseUrl(process.env.FREE_INFERENCE_BASE_URL ?? DEFAULT_BASE_URL);
    this.model = process.env.FREE_INFERENCE_MODEL ?? DEFAULT_MODEL;
  }

  async generateCompletion(prompt: string, options: CompletionOptions = {}): Promise<string> {
    const body = {
      model: options.model ?? this.model,
      messages: [
        {
          role: 'system',
          content: [
            'Você é o Copilot institucional do Motor Originação SRM.',
            'Apoie analistas de crédito estruturado com análises objetivas sobre',
            'empresas candidatas a operações de FIDC, CRI, CRA, debênture e outras estruturas de dívida.',
            'Responda sempre em português do Brasil, de forma técnica e concisa.',
            'Baseie-se exclusivamente no contexto fornecido e explicite limitações.',
            'Nunca invente fatos, valores, CNPJs, pessoas, operações ou fontes.',
          ].join(' '),
        },
        { role: 'user', content: prompt.slice(0, 12_000) },
      ],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: Math.max(64, Math.min(1024, options.maxTokens ?? DEFAULT_MAX_TOKENS)),
      stream: false,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`free inference node HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('free inference node returned empty content');
      }
      return content.trim();
    } catch (error) {
      return this.errorFallback(error);
    }
  }

  private errorFallback(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return [
      '⚠️ **Copilot gratuito temporariamente indisponível.**',
      '',
      'Nenhuma API paga foi acionada como fallback.',
      `Detalhe técnico: ${msg.slice(0, 180)}`,
    ].join('\n');
  }
}
