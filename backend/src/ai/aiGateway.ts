import type { LLMGateway } from './types.js';

export type CompletionOptions = {
  model?: string;
  temperature?: number;
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

export class AIGateway implements LLMGateway {
  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    if (!apiKey) {
      return 'ANTHROPIC_API_KEY não configurada. O Copilot está ativo, mas o provedor LLM real ainda não foi habilitado.';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model ?? 'claude-opus-4-6',
        max_tokens: 1024,
        temperature: options?.temperature ?? 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json() as AnthropicResponse;

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Anthropic API error: ${response.status}`);
    }

    const text = data.content?.find((item) => item.type === 'text' && item.text)?.text?.trim();
    return text || 'Sem resposta do modelo.';
  }
}
