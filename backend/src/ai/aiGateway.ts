/**
 * AIGateway — Motor Originação SRM
 * Conecta o CopilotQueryEngine à API real da Anthropic.
 *
 * Variável de ambiente necessária:
 *   ANTHROPIC_API_KEY=sk-ant-...
 */
import type { LLMGateway } from './types.js';

export type CompletionOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.3;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class AIGateway implements LLMGateway {
  private readonly apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    if (!this.apiKey) {
      console.warn('[AIGateway] ANTHROPIC_API_KEY não configurada — respostas serão simuladas.');
    }
  }

  async generateCompletion(prompt: string, options: CompletionOptions = {}): Promise<string> {
    if (!this.apiKey) return this.simulatedResponse(prompt);

    const body = {
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      system: [
        'Você é o Copilot institucional do Motor Originação SRM.',
        'Apoie analistas de crédito estruturado com análises objetivas sobre',
        'empresas candidatas a operações de FIDC, CRI, CRA e outras estruturas de dívida.',
        'Responda sempre em português do Brasil, de forma técnica e concisa.',
        'Baseie-se exclusivamente no contexto fornecido. Explicite limitações quando houver lacunas.',
      ].join(' '),
      messages: [{ role: 'user', content: prompt }],
    };

    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      try {
        const response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          if (response.status === 429 && attempt < 3) {
            const retryAfter = Number(response.headers.get('retry-after') ?? 5);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue;
          }
          throw new Error(`Anthropic API ${response.status}`);
        }

        const data = await response.json() as any;
        const text = data.content
          ?.filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n')
          .trim();
        if (!text) throw new Error('Resposta vazia da API');
        return text;
      } catch (err) {
        if (attempt >= 3) return this.errorFallback(err);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    return this.errorFallback(new Error('Retry loop exited'));
  }

  private simulatedResponse(prompt: string): string {
    return (
      '⚠️ **Modo simulado** — ANTHROPIC_API_KEY não configurada.\n\n' +
      `Pergunta: "${prompt.slice(0, 100)}..."\n\n` +
      'Configure ANTHROPIC_API_KEY no Vercel para ativar o Copilot real.'
    );
  }

  private errorFallback(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return `⚠️ **Copilot temporariamente indisponível.**\n\nDetalhe: ${msg.slice(0, 200)}`;
  }
}
